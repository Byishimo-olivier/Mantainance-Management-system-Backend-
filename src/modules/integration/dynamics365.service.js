const axios = require('axios');
const crypto = require('crypto');
const mongoose = require('mongoose');

const collectionName = 'IntegrationSettings';
const provider = 'dynamics365';

const normalizeUrl = (value = '') => String(value || '').trim().replace(/\/+$/, '');
const getEncryptionKey = () => crypto
  .createHash('sha256')
  .update(process.env.DYNAMICS_365_SECRET_KEY || process.env.JWT_SECRET || 'fixnest-dynamics365')
  .digest();

const encryptSecret = (value = '') => {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

const decryptSecret = (value = '') => {
  if (!value || !String(value).includes(':')) return value || '';
  const [ivText, tagText, encryptedText] = String(value).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64')),
    decipher.final()
  ]).toString('utf8');
};

const sanitizeConfig = (config = {}) => ({
  provider,
  enabled: !!config.enabled,
  tenantId: config.tenantId || '',
  clientId: config.clientId || '',
  environmentUrl: config.environmentUrl || '',
  apiVersion: config.apiVersion || 'v9.2',
  syncDirection: config.syncDirection || 'pull',
  entityMappings: {
    assets: config.entityMappings?.assets || 'msdyn_customerassets',
    workOrders: config.entityMappings?.workOrders || 'msdyn_workorders',
    accounts: config.entityMappings?.accounts || 'accounts',
    meters: config.entityMappings?.meters || '',
  },
  lastTestedAt: config.lastTestedAt || null,
  lastSyncAt: config.lastSyncAt || null,
  lastSyncSummary: config.lastSyncSummary || null,
  createdAt: config.createdAt || null,
  updatedAt: config.updatedAt || null,
  hasClientSecret: !!config.clientSecret,
});

const getCollection = () => mongoose.connection.db.collection(collectionName);

async function getRawConfig(companyName = '') {
  if (!companyName) return null;
  const config = await getCollection().findOne({ companyName: String(companyName).trim(), provider });
  if (!config) return null;
  return {
    ...config,
    clientSecret: config.clientSecretEncrypted ? decryptSecret(config.clientSecretEncrypted) : config.clientSecret,
  };
}

async function getConfig(companyName = '') {
  const config = await getRawConfig(companyName);
  return sanitizeConfig(config || {});
}

async function saveConfig(companyName = '', data = {}) {
  if (!companyName) throw new Error('Company name is required');
  const existing = await getRawConfig(companyName);
  const now = new Date();
  const update = {
    provider,
    companyName: String(companyName).trim(),
    enabled: !!data.enabled,
    tenantId: String(data.tenantId || '').trim(),
    clientId: String(data.clientId || '').trim(),
    environmentUrl: normalizeUrl(data.environmentUrl),
    apiVersion: String(data.apiVersion || 'v9.2').trim(),
    syncDirection: data.syncDirection || 'pull',
    entityMappings: {
      assets: data.entityMappings?.assets || 'msdyn_customerassets',
      workOrders: data.entityMappings?.workOrders || 'msdyn_workorders',
      accounts: data.entityMappings?.accounts || 'accounts',
      meters: data.entityMappings?.meters || '',
    },
    updatedAt: now,
  };

  if (data.clientSecret) {
    update.clientSecretEncrypted = encryptSecret(data.clientSecret);
  } else if (existing?.clientSecretEncrypted) {
    update.clientSecretEncrypted = existing.clientSecretEncrypted;
  } else if (existing?.clientSecret) {
    update.clientSecretEncrypted = encryptSecret(existing.clientSecret);
  }

  if (!existing) update.createdAt = now;

  await getCollection().updateOne(
    { companyName: String(companyName).trim(), provider },
    { $set: update, $unset: { clientSecret: '' } },
    { upsert: true }
  );

  return getConfig(companyName);
}

function assertReady(config) {
  const missing = ['tenantId', 'clientId', 'clientSecret', 'environmentUrl'].filter((key) => !config?.[key]);
  if (missing.length) {
    throw new Error(`Dynamics 365 configuration is incomplete: ${missing.join(', ')}`);
  }
}

async function getAccessToken(config) {
  assertReady(config);
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'client_credentials',
    scope: `${normalizeUrl(config.environmentUrl)}/.default`,
  });

  const response = await axios.post(tokenUrl, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 20000,
  });
  return response.data?.access_token;
}

async function dataverseRequest(config, path, options = {}) {
  const token = await getAccessToken(config);
  const baseUrl = `${normalizeUrl(config.environmentUrl)}/api/data/${config.apiVersion || 'v9.2'}`;
  const response = await axios({
    method: options.method || 'get',
    url: `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'odata.maxpagesize=10',
      ...(options.headers || {}),
    },
    data: options.data,
    timeout: options.timeout || 30000,
  });
  return response.data;
}

async function testConnection(companyName = '') {
  const config = await getRawConfig(companyName);
  const result = await dataverseRequest(config, 'WhoAmI()');
  await getCollection().updateOne(
    { companyName: String(companyName).trim(), provider },
    { $set: { lastTestedAt: new Date(), lastTestResult: { ok: true, organizationId: result?.OrganizationId || null } } }
  );
  return { ok: true, organizationId: result?.OrganizationId || null, userId: result?.UserId || null };
}

async function syncPreview(companyName = '') {
  const config = await getRawConfig(companyName);
  assertReady(config);
  const mappings = sanitizeConfig(config).entityMappings;
  const summary = {};

  for (const [key, entitySet] of Object.entries(mappings)) {
    if (!entitySet) continue;
    const data = await dataverseRequest(config, `${entitySet}?$top=10`);
    summary[key] = {
      entitySet,
      fetched: Array.isArray(data?.value) ? data.value.length : 0,
      sample: Array.isArray(data?.value) ? data.value.slice(0, 3) : [],
    };
  }

  await getCollection().updateOne(
    { companyName: String(companyName).trim(), provider },
    { $set: { lastSyncAt: new Date(), lastSyncSummary: summary } }
  );

  return { ok: true, mode: 'preview', summary };
}

module.exports = {
  getConfig,
  saveConfig,
  testConnection,
  syncPreview,
};
