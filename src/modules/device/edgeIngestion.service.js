const axios = require('axios');
const mongoose = require('mongoose');
const deviceService = require('./device.service');
const notificationService = require('../notification/notification.service');
const emailService = require('../emailService/email.service');
const smsService = require('../sms/sms.service');
const userService = require('../user/user.service');

const DEFAULT_CRON_EXPRESSION = process.env.EDGE_INGESTION_CRON || '*/5 * * * *';
const DEFAULT_TIMEOUT_MS = Number(process.env.EDGE_INGESTION_TIMEOUT_MS || 10000);
const MAX_RETAINED_READINGS = Number(process.env.EDGE_DEVICE_MAX_RETAINED_READINGS || 50);

const safeTrim = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const parseMaybeJson = (value) => {
  if (value === undefined || value === null || value === '') return value;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};

const getNumberValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeRule = (rule) => {
  if (!rule || typeof rule !== 'object') return null;
  const name = safeTrim(rule.sensorName || rule.name || rule.key || rule.id || '');
  const operator = String(rule.operator || rule.comparison || '>=').trim();
  const target = getNumberValue(rule.value ?? rule.threshold ?? rule.triggerValue ?? rule.target);
  if (target === null) return null;
  return {
    name,
    operator,
    target,
    severity: safeTrim(rule.severity || rule.level || 'warning'),
    message: safeTrim(rule.message || rule.description || ''),
    metadata: rule.metadata || {},
  };
};

const operatorFuncs = {
  '>': (value, target) => value > target,
  '>=': (value, target) => value >= target,
  '<': (value, target) => value < target,
  '<=': (value, target) => value <= target,
  '==': (value, target) => value === target,
  '===': (value, target) => value === target,
  '!=': (value, target) => value !== target,
  '<>': (value, target) => value !== target,
};

const compare = (value, rule) => {
  const fn = operatorFuncs[rule.operator] || operatorFuncs['>='];
  return fn(value, rule.target);
};

const normalizeReadingEntry = (raw, index = 0) => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number' || typeof raw === 'string') {
    const numeric = getNumberValue(raw);
    if (numeric === null) return null;
    return {
      id: `reading-${index}`,
      sensorName: `reading-${index}`,
      value: numeric,
      unit: '',
      timestamp: new Date(),
      raw,
    };
  }

  if (!isObject(raw)) return null;

  const sensorName = safeTrim(raw.sensor || raw.name || raw.id || raw.label || raw.type || `reading-${index}`);
  const value = getNumberValue(raw.value ?? raw.reading ?? raw.measurement ?? raw.current ?? raw.level ?? raw.temperature ?? raw.pressure ?? raw.humidity);

  if (value === null) {
    const numericField = Object.keys(raw).find((key) => getNumberValue(raw[key]) !== null);
    if (numericField) {
      return {
        id: raw.id ? String(raw.id) : `reading-${index}`,
        sensorName: safeTrim(raw.sensor || raw.name || numericField || `reading-${index}`),
        value: getNumberValue(raw[numericField]),
        unit: safeTrim(raw.unit || raw.uom || raw.units || ''),
        timestamp: raw.timestamp ? new Date(raw.timestamp) : raw.recordedAt ? new Date(raw.recordedAt) : new Date(),
        raw,
      };
    }
    return null;
  }

  const timestamp = raw.timestamp ? new Date(raw.timestamp) : raw.recordedAt ? new Date(raw.recordedAt) : new Date();

  return {
    id: raw.id ? String(raw.id) : `reading-${index}`,
    sensorName,
    value,
    unit: safeTrim(raw.unit || raw.uom || raw.units || ''),
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    raw,
  };
};

const flattenGatewayPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!isObject(payload)) return [payload];
  if (Array.isArray(payload.sensors)) return payload.sensors;
  if (Array.isArray(payload.readings)) return payload.readings;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.values)) return payload.values;

  const numericEntries = Object.keys(payload)
    .filter((key) => getNumberValue(payload[key]) !== null)
    .map((key) => ({ name: key, value: getNumberValue(payload[key]), unit: '', timestamp: payload.timestamp || payload.recordedAt || new Date() }));

  if (numericEntries.length > 0) return numericEntries;

  return [payload];
};

const getSensorReadings = (gatewayResponse) => {
  if (gatewayResponse === undefined || gatewayResponse === null) return [];
  const payload = parseMaybeJson(gatewayResponse);
  const flattened = flattenGatewayPayload(payload);
  return flattened
    .map((raw, index) => normalizeReadingEntry(raw, index))
    .filter(Boolean);
};

const matchesRuleForReading = (reading, rule) => {
  if (!reading || typeof reading.value !== 'number' || !rule) return false;
  if (!rule.name) return compare(reading.value, rule);
  const normalizedSensor = String(reading.sensorName || reading.name || '').toLowerCase();
  const normalizedRuleName = String(rule.name).toLowerCase();
  if (!normalizedRuleName) return compare(reading.value, rule);
  if (normalizedSensor === normalizedRuleName || normalizedSensor.includes(normalizedRuleName) || normalizedRuleName.includes(normalizedSensor)) {
    return compare(reading.value, rule);
  }
  return false;
};

const getAlertRules = (device) => {
  const rawRules = device.triggers || device.thresholds || device.alertRules || [];
  if (Array.isArray(rawRules)) {
    return rawRules.map(normalizeRule).filter(Boolean);
  }
  if (isObject(rawRules)) {
    const rule = normalizeRule(rawRules);
    return rule ? [rule] : [];
  }
  return [];
};

const buildIssuePayload = ({ device, reading, rule }) => {
  const now = new Date();
  const title = `Edge alert: ${device.name || device.deviceName || 'Edge Device'} ${reading.sensorName || 'reading'}`;
  const issueDescription = [
    rule.message || 'A sensor threshold was triggered by an edge gateway.',
    `Device: ${device.name || device.deviceName || device.id || 'unknown'}`,
    `Sensor: ${reading.sensorName || 'unknown'}`,
    `Value: ${reading.value}${reading.unit ? ` ${reading.unit}` : ''}`,
    `Rule: ${rule.operator} ${rule.target}`,
    `Gateway: ${device.gatewayUrl || device.apiUrl || 'unknown'}`,
  ].filter(Boolean).join('\n');

  const createWorkOrder = shouldCreateWorkOrder(rule, device);
  const tags = ['edge-device', 'alert', 'gateway-ingest'];
  if (createWorkOrder) tags.push('work-order');

  return {
    title,
    description: issueDescription,
    location: device.location || device.assetLocation || device.locationName || 'Edge Gateway',
    propertyId: device.propertyId || null,
    assetId: device.assetId || null,
    assignedTo: device.assignedTo || null,
    assignedToName: device.assignedToName || null,
    assignees: Array.isArray(device.assignees) ? device.assignees : [],
    companyName: device.companyName || device.company || '',
    createdAt: now,
    updatedAt: now,
    status: createWorkOrder ? 'OPEN' : 'ALERT',
    priority: rule.severity?.toUpperCase() || 'MEDIUM',
    tags,
    sourceType: 'edge-gateway',
    deviceId: String(device.id || device._id || ''),
    deviceName: device.name || device.deviceName || '',
    sensorName: reading.sensorName || reading.name || '',
    readingValue: reading.value,
    readingUnit: reading.unit || '',
    edgeAlertKey: `edge:${String(device.id || device._id || '')}:${safeTrim(rule.name || reading.sensorName || 'unknown').replace(/\s+/g, '_')}:${(reading.timestamp || now).toISOString().slice(0, 10)}`,
    edgeAlertRule: rule.name || '',
    edgeAlertOperator: rule.operator,
    edgeAlertTarget: rule.target,
    alertSeverity: rule.severity,
    createdBySchedule: false,
    createdByEdgeAlert: true,
    edgeAlertMetadata: rule.metadata || {},
  };
};

const collectUniqueValues = (items = []) => Array.from(new Set((Array.isArray(items) ? items : [items]).filter(Boolean)));

const collectPhonesFromUsers = (users = []) => collectUniqueValues(users.map((user) => user?.phone || user?.mobile || user?.phoneNumber || '')).map(String);

const collectNotificationPhones = async (issue, device) => {
  const phones = [];
  if (device.assignees) {
    if (Array.isArray(device.assignees)) {
      device.assignees.forEach((assignee) => {
        if (assignee && typeof assignee === 'object') {
          phones.push(assignee.phone || assignee.mobile || assignee.phoneNumber || '');
        } else if (typeof assignee === 'string') {
          phones.push(assignee);
        }
      });
    } else if (typeof device.assignees === 'string') {
      phones.push(device.assignees);
    }
  }
  if (device.phone) phones.push(device.phone);
  if (device.notificationPhones) {
    if (Array.isArray(device.notificationPhones)) phones.push(...device.notificationPhones);
    else if (typeof device.notificationPhones === 'string') phones.push(...device.notificationPhones.split(',').map((v) => v.trim()));
  }
  if (issue.companyName) {
    const companyAdmins = await userService.getUsersByRoles(['admin', 'manager'], { companyName: String(issue.companyName).trim(), status: 'active' });
    phones.push(...collectPhonesFromUsers(companyAdmins));
  }
  return collectUniqueValues(phones.map((phone) => String(phone || '').trim())).filter(Boolean);
};

const buildEdgeAlertEmailHtml = ({ issue, device, rule, issueId }) => {
  const ruleDetails = rule ? `Rule: ${rule.name || 'Unnamed'} ${rule.operator} ${rule.target}` : 'Rule: Not specified';
  const issueLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager-dashboard?tab=issues&id=${issueId || issue.id || issue.edgeAlertKey || ''}`;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #111827;">
      <h2 style="color: #dc2626;">Edge Device Alert</h2>
      <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p><strong>Device:</strong> ${device.name || device.deviceName || 'Unknown device'}</p>
        <p><strong>Location:</strong> ${device.location || device.assetLocation || device.locationName || 'Unknown location'}</p>
        <p><strong>Sensor:</strong> ${issue.sensorName || 'Unknown sensor'}</p>
        <p><strong>Value:</strong> ${issue.readingValue}${issue.readingUnit ? ` ${issue.readingUnit}` : ''}</p>
        <p><strong>Severity:</strong> ${issue.alertSeverity || rule?.severity || 'warning'}</p>
        <p><strong>${ruleDetails}</strong></p>
        <p><strong>Gateway endpoint:</strong> ${device.gatewayUrl || device.apiUrl || 'Unknown'}</p>
        <p><strong>Issue link:</strong> <a href="${issueLink}">${issueLink}</a></p>
      </div>
      <p>Please review the alert and take action as needed.</p>
    </div>
  `;
};

const sendEdgeAlertEmails = async ({ issue, device, rule, issueId }) => {
  try {
    const companyName = String(issue.companyName || device.companyName || '').trim();
    const recipients = companyName ? await emailService.getAdminManagerClientEmails(companyName) : [];
    if (!recipients || recipients.length === 0) return;
    const subject = `Edge Alert: ${issue.title}`;
    const html = buildEdgeAlertEmailHtml({ issue, device, rule, issueId });
    await emailService.sendEmail({
      to: recipients.join(','),
      subject,
      html,
    });
  } catch (error) {
    console.error('[EdgeIngestion] Failed to send edge alert email:', error.message || error);
  }
};

const sendEdgeAlertSms = async ({ issue, device, issueId }) => {
  try {
    const recipients = await collectNotificationPhones(issue, device);
    if (!recipients.length) return;
    const link = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager-dashboard?tab=issues&id=${issueId || issue.id || issue.edgeAlertKey || ''}`;
    const body = `Edge Alert: ${issue.title}. Sensor ${issue.sensorName} reported ${issue.readingValue}${issue.readingUnit ? ` ${issue.readingUnit}` : ''}. Review: ${link}`;
    await smsService.sendBulkSms({ recipients, body });
  } catch (error) {
    console.error('[EdgeIngestion] Failed to send edge alert SMS:', error.message || error);
  }
};

const createNotificationsForIssue = async (issue, device, issueId) => {
  const recipients = [];
  if (device.assignedTo) recipients.push(String(device.assignedTo));
  if (Array.isArray(device.assignees)) {
    device.assignees.forEach((assignee) => {
      if (assignee && typeof assignee === 'object' && assignee.id) recipients.push(String(assignee.id));
      else if (typeof assignee === 'string') recipients.push(assignee);
    });
  }

  const uniqueRecipients = Array.from(new Set(recipients.filter(Boolean)));
  const notificationText = `Edge device alert created for ${issue.deviceName || issue.deviceId}. Sensor ${issue.sensorName} reported ${issue.readingValue}${issue.readingUnit ? ` ${issue.readingUnit}` : ''}.`;

  if (uniqueRecipients.length > 0) {
    await Promise.all(uniqueRecipients.map(async (userId) => {
      try {
        await notificationService.createNotification({
          userId,
          title: `Edge Alert: ${issue.deviceName || 'Device'}`,
          message: notificationText,
          type: 'warning',
          link: `/manager-dashboard?tab=issues&id=${issueId}`,
        });
      } catch (error) {
        console.error('[EdgeIngestion] Failed to notify assigned user', userId, error.message || error);
      }
    }));
    return;
  }

  if (issue.companyName) {
    await notificationService.notifyCompanyAdmins({
      title: `Edge Alert: ${issue.deviceName || 'Device'}`,
      message: notificationText,
      type: 'warning',
      link: `/manager-dashboard?tab=issues&id=${issueId}`,
      companyName: issue.companyName,
    });
  }
};

const updateLinkedAssetCondition = async (device, issue) => {
  if (!device.assetId) return;
  const db = mongoose.connection.db;
  if (!db) return;
  try {
    const { ObjectId } = require('mongodb');
    const assetId = String(device.assetId || '');
    if (!/^[a-fA-F0-9]{24}$/.test(assetId)) return;
    await db.collection('Asset').updateOne(
      { _id: new ObjectId(assetId) },
      {
        $set: {
          status: 'Alert',
          condition: issue.alertSeverity || 'Alert',
          lastEdgeAlertAt: new Date(),
          updatedAt: new Date(),
        }
      }
    );
  } catch (error) {
    console.error('[EdgeIngestion] Failed to update linked asset condition:', error.message || error);
  }
};

const ensureEdgeIssueIndex = async () => {
  const db = mongoose.connection.db;
  if (!db) return;
  try {
    await db.collection('Issue').createIndex(
      { edgeAlertKey: 1 },
      { unique: true, sparse: true, name: 'unique_edge_alert_key' }
    );
  } catch (error) {
    if (!String(error.message || '').includes('already exists')) {
      console.warn('[EdgeIngestion] Could not ensure edge issue index:', error.message || error);
    }
  }
};

const parseBooleanValue = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
  }
  return Boolean(value);
};

const shouldCreateWorkOrder = (rule, device) => {
  if (rule && Object.prototype.hasOwnProperty.call(rule.metadata || {}, 'createWorkOrder')) {
    return parseBooleanValue(rule.metadata.createWorkOrder);
  }
  if (Object.prototype.hasOwnProperty.call(device || {}, 'createWorkOrder')) {
    return parseBooleanValue(device.createWorkOrder);
  }
  return true;
};

const createEdgeIssue = async ({ device, reading, rule }) => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB connection not ready');
  }

  const issue = buildIssuePayload({ device, reading, rule });
  await ensureEdgeIssueIndex();

  const existing = await db.collection('Issue').findOne({ edgeAlertKey: issue.edgeAlertKey });
  if (existing) {
    return String(existing._id);
  }

  const result = await db.collection('Issue').insertOne(issue);
  const issueId = result.insertedId.toString();
  await Promise.allSettled([
    createNotificationsForIssue(issue, device, issueId),
    updateLinkedAssetCondition(device, issue),
    sendEdgeAlertEmails({ issue, device, rule, issueId }),
    sendEdgeAlertSms({ issue, device, issueId }),
  ]).then((results) => {
    const rejected = results.filter((r) => r.status === 'rejected');
    if (rejected.length) {
      rejected.forEach((r) => console.error('[EdgeIngestion] Side effect failed:', r.reason?.message || r.reason));
    }
  });
  return issueId;
};

const buildRequestOptions = (device) => {
  const headers = {
    Accept: 'application/json',
    ...parseMaybeJson(device.gatewayHeaders),
  };

  if (safeTrim(device.authToken)) {
    headers.Authorization = `Bearer ${safeTrim(device.authToken)}`;
  }
  if (safeTrim(device.gatewayApiKey) && !headers['x-api-key']) {
    headers['x-api-key'] = safeTrim(device.gatewayApiKey);
  }

  return {
    timeout: DEFAULT_TIMEOUT_MS,
    headers,
    validateStatus: (status) => status >= 200 && status < 300,
  };
};

const pollGateway = async (device) => {
  if (!device || !isObject(device)) {
    return { deviceId: null, success: false, message: 'Invalid device' };
  }

  const now = new Date();
  const result = {
    deviceId: String(device.id || device._id || ''),
    name: device.name || device.deviceName || '',
    gatewayUrl: safeTrim(device.gatewayUrl || device.apiUrl || ''),
    success: false,
    error: null,
    readings: [],
    alerts: [],
  };

  const endpoint = safeTrim(device.gatewayUrl || device.apiUrl || '');
  if (!endpoint) {
    result.error = 'No gatewayUrl or apiUrl configured';
    return result;
  }
  if (safeTrim(device.active).toLowerCase() === 'false' || device.active === false) {
    result.message = 'Device inactive, skipped';
    return result;
  }

  const requestOptions = buildRequestOptions(device);

  try {
    const method = String(device.gatewayMethod || device.method || 'GET').toUpperCase();
    let response;
    if (method === 'POST') {
      const body = parseMaybeJson(device.gatewayBody);
      response = await axios.post(endpoint, body, requestOptions);
    } else if (method === 'PUT') {
      const body = parseMaybeJson(device.gatewayBody);
      response = await axios.put(endpoint, body, requestOptions);
    } else {
      response = await axios.get(endpoint, requestOptions);
    }

    const rawPayload = response.data;
    const readings = getSensorReadings(rawPayload);
    result.readings = readings;

    const rules = getAlertRules(device);
    const alerts = [];
    if (rules.length > 0) {
      for (const reading of readings) {
        for (const rule of rules) {
          if (matchesRuleForReading(reading, rule)) {
            const issueId = await createEdgeIssue({ device, reading, rule });
            alerts.push({ rule, reading, issueId });
          }
        }
      }
    }

    result.alerts = alerts;
    result.success = true;

    const deviceUpdate = {
      lastPollAt: now,
      lastPollStatus: 'success',
      lastPollError: null,
      failedPollCount: 0,
      status: alerts.length > 0 ? 'Alert' : 'Online',
      lastReadings: readings.map((entry) => ({
        sensorName: entry.sensorName,
        value: entry.value,
        unit: entry.unit,
        timestamp: entry.timestamp,
      })),
      updatedAt: now,
    };

    const existing = await deviceService.findById(result.deviceId, device.companyName || '');
    if (existing) {
      const prevReadings = Array.isArray(existing.readings) ? existing.readings : [];
      const allReadings = [...prevReadings, ...deviceUpdate.lastReadings].slice(-MAX_RETAINED_READINGS);
      deviceUpdate.readings = allReadings;
    }

    await deviceService.update(result.deviceId, deviceUpdate, device.companyName || '');
    return result;
  } catch (error) {
    const errorMessage = error?.response?.data ? JSON.stringify(error.response.data) : String(error.message || error);
    result.error = errorMessage;
    result.success = false;
    result.lastPollAt = now;

    try {
      await deviceService.update(result.deviceId, {
        lastPollAt: now,
        lastPollStatus: 'failed',
        lastPollError: errorMessage,
        failedPollCount: Number(device.failedPollCount || 0) + 1,
        status: 'Offline',
        updatedAt: now,
      }, device.companyName || '');
    } catch (updateError) {
      console.error('[EdgeIngestion] Failed to update device after poll error:', updateError.message || updateError);
    }

    console.error(`[EdgeIngestion] Poll failed for device ${result.deviceId}:`, errorMessage);
    return result;
  }
};

const pollAllGateways = async () => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB connection not ready');
  }

  const devices = await deviceService.findAll();
  const results = [];

  for (const device of devices) {
    try {
      const pollResult = await pollGateway(device);
      results.push(pollResult);
    } catch (error) {
      console.error('[EdgeIngestion] Unexpected failure polling gateway for device', device.id || device._id, error.message || error);
      results.push({ deviceId: String(device.id || device._id || ''), success: false, error: String(error.message || error) });
    }
  }

  return results;
};

const startEdgeIngestionCron = (cronService) => {
  if (!cronService || typeof cronService.schedule !== 'function') {
    console.warn('[EdgeIngestion] Cron service not available');
    return null;
  }

  const schedule = safeTrim(process.env.EDGE_INGESTION_CRON) || DEFAULT_CRON_EXPRESSION;
  const jobId = cronService.schedule(schedule, async () => {
    console.log('[EdgeIngestion] Running scheduled gateway ingestion');
    try {
      const results = await pollAllGateways();
      console.log(`[EdgeIngestion] Poll complete: ${results.length} devices processed`);
    } catch (error) {
      console.error('[EdgeIngestion] Scheduled run failed:', error.message || error);
    }
  });

  console.log(`[EdgeIngestion] Scheduled gateway ingestion with cron expression: ${schedule}`);
  return jobId;
};

module.exports = {
  pollGateway,
  pollAllGateways,
  startEdgeIngestionCron,
};
