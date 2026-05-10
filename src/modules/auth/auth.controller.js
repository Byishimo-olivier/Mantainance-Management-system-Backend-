const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const User = require('../user/user.model.js');
const auditService = require('../auditLog/auditLog.service');
const AuditLog = require('../auditLog/auditLog.model');
const systemSettingsService = require('../systemSettings/systemSettings.service');
const notificationService = require('../notification/notification.service');
const emailService = require('../emailService/email.service');
const prisma = new PrismaClient();

const FAILED_LOGIN_ALERT_THRESHOLD = 3;
const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const buildDashboardLink = () => `${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager-dashboard?tab=settings`;
const getFrontendOrigin = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const getBackendOrigin = () => (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '');
const buildSupportMessage = (supportEmail) => supportEmail
  ? `Your account is locked. Please contact support at ${supportEmail}.`
  : 'Your account is locked. Please contact support.';

const parseJsonEnv = (key, fallback) => {
  try {
    return process.env[key] ? JSON.parse(process.env[key]) : fallback;
  } catch (error) {
    console.warn(`[SSO] Failed to parse ${key}:`, error.message);
    return fallback;
  }
};

const normalizeDomain = (value) => String(value || '').trim().toLowerCase().replace(/^@/, '');
const slugifySsoKey = (value) => normalizeDomain(value)
  .replace(/\.[a-z0-9-]+$/i, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
const toTitleCase = (value) => String(value || '')
  .replace(/[-_.]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (char) => char.toUpperCase());

const getGoogleRedirectUri = () => (
  process.env.GOOGLE_CALLBACK_URL ||
  process.env.GOOGLE_REDIRECT_URI ||
  `${getBackendOrigin()}/api/auth/google/callback`
);

const getGoogleProvider = () => ({
  providerName: 'Google',
  authorizationUrl: GOOGLE_AUTHORIZATION_URL,
  tokenUrl: GOOGLE_TOKEN_URL,
  userInfoUrl: GOOGLE_USERINFO_URL,
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  scope: process.env.GOOGLE_SCOPE || 'openid email profile',
  redirectUri: getGoogleRedirectUri(),
  prompt: process.env.GOOGLE_PROMPT || 'select_account',
  providerType: 'google',
});

const getSsoProviders = () => {
  const providers = parseJsonEnv('SSO_PROVIDERS_JSON', null);
  const googleProvider = process.env.GOOGLE_CLIENT_ID ? { google: getGoogleProvider() } : {};
  if (providers && typeof providers === 'object') return { ...providers, ...googleProvider };

  const domain = normalizeDomain(process.env.SSO_DOMAIN);
  if (!domain) return googleProvider;
  const provider = {
    providerName: process.env.SSO_PROVIDER_NAME || 'Company SSO',
    authorizationUrl: process.env.SSO_AUTHORIZATION_URL,
    tokenUrl: process.env.SSO_TOKEN_URL,
    userInfoUrl: process.env.SSO_USERINFO_URL,
    clientId: process.env.SSO_CLIENT_ID,
    clientSecret: process.env.SSO_CLIENT_SECRET,
    scope: process.env.SSO_SCOPE || 'openid email profile',
    redirectUri: process.env.SSO_REDIRECT_URI,
  };
  const keys = Array.from(new Set([
    domain,
    normalizeDomain(process.env.SSO_COMPANY_ID),
    slugifySsoKey(domain),
  ].filter(Boolean)));
  return {
    ...Object.fromEntries(keys.map((key) => [key, provider])),
    ...googleProvider,
  };
};

const findSsoProvider = ({ email, companyId }) => {
  const providers = getSsoProviders();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const domain = normalizedEmail.includes('@') ? normalizedEmail.split('@').pop() : '';
  const key = normalizeDomain(companyId) || normalizeDomain(domain);
  const candidates = Array.from(new Set([
    key,
    normalizeDomain(domain),
    slugifySsoKey(key),
    slugifySsoKey(domain),
  ].filter(Boolean)));
  const matchedKey = candidates.find((candidate) => providers[candidate]);
  const provider = matchedKey ? providers[matchedKey] : null;
  return provider ? { key: matchedKey, provider } : null;
};

const findUserForSso = async (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  const mongoUser = await User.findOne({ email: normalizedEmail });
  if (mongoUser) {
    return { user: mongoUser, role: mongoUser.role, userId: String(mongoUser._id), companyName: mongoUser.companyName || null, isPrisma: false };
  }

  const prismaUser = await prisma.user.findFirst({ where: { email: normalizedEmail } });
  if (prismaUser) {
    return { user: prismaUser, role: prismaUser.role, userId: String(prismaUser.id), companyName: prismaUser.companyName || null, isPrisma: true };
  }

  return null;
};

const buildAuthResponse = async ({ user, role, userId, companyName }) => {
  let companyId = null;
  if (companyName) {
    const companyRecord = await prisma.company.findUnique({
      where: { name: String(companyName).trim() },
      select: { id: true },
    }).catch(() => null);
    companyId = companyRecord?.id || null;
  }

  const token = jwt.sign({ userId, role, companyName }, process.env.JWT_SECRET, { expiresIn: '24h' });
  return {
    token,
    user: {
      _id: userId,
      id: String(userId),
      name: user.name,
      email: user.email,
      role,
      companyName,
      companyId: companyId ? String(companyId) : null,
      companyType: user.companyType || 'main',
      branchName: user.branchName || '',
      branchDetails: user.branchDetails || '',
    },
  };
};

const getAllowedGoogleDomains = () => String(process.env.GOOGLE_SSO_ALLOWED_DOMAINS || '')
  .split(',')
  .map(normalizeDomain)
  .filter(Boolean);

const isGoogleEmailAllowed = (email, hostedDomain) => {
  const allowedDomains = getAllowedGoogleDomains();
  if (!allowedDomains.length) return true;

  const emailDomain = normalizeDomain(String(email || '').split('@').pop());
  const hd = normalizeDomain(hostedDomain);
  return allowedDomains.includes(emailDomain) || (hd && allowedDomains.includes(hd));
};

const getCompanyNameForGoogleProfile = (profile) => {
  const email = String(profile.email || '').trim().toLowerCase();
  const domain = normalizeDomain(profile.hd || email.split('@').pop());
  const explicitCompany = String(process.env.GOOGLE_SSO_DEFAULT_COMPANY_NAME || '').trim();
  if (explicitCompany) return explicitCompany;
  if (!domain) return 'Google SSO';
  return toTitleCase(domain.replace(/\.[a-z0-9-]+$/i, '')) || domain;
};

const getDefaultGoogleRole = () => {
  const role = String(process.env.GOOGLE_SSO_DEFAULT_ROLE || 'client').trim().toLowerCase();
  return ['admin', 'manager', 'technician', 'client', 'requestor', 'staff'].includes(role) ? role : 'client';
};

const ensureCompanyTrialForSsoUser = async ({ companyName, userId, email }) => {
  if (!companyName || String(companyName).toUpperCase() === 'SYSTEM') return null;

  try {
    const companySubscriptionService = require('../subscription/company-subscription.service');
    const trialService = require('../subscription/trial.service');
    const company = await companySubscriptionService.ensureCompanyExists(companyName, String(userId), email);
    const companyId = company?.id ? String(company.id) : null;

    if (companyId) {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          email: company.email || email || undefined,
          adminId: company.adminId || String(userId),
        },
      }).catch(() => null);

      const freshCompany = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          trialStartDate: true,
          trialEndDate: true,
          subscriptionStatus: true,
          trialExceeded: true,
        },
      });

      const needsTrialInitialization =
        freshCompany &&
        !freshCompany.trialStartDate &&
        !freshCompany.trialEndDate &&
        String(freshCompany.subscriptionStatus || 'inactive').toLowerCase() === 'inactive' &&
        freshCompany.trialExceeded !== true;

      if (needsTrialInitialization) {
        await trialService.initializeFreeTrial(companyId);
      }
    }

    return companyId;
  } catch (err) {
    console.error('[Google SSO] Failed to ensure company/trial:', err.message);
    return null;
  }
};

const findOrCreateGoogleUser = async (profile) => {
  const email = String(profile.email || '').trim().toLowerCase();
  if (!email) throw new Error('Google did not return an email address.');
  if (profile.email_verified === false || String(profile.email_verified).toLowerCase() === 'false') {
    throw new Error('Google email address is not verified.');
  }
  if (!isGoogleEmailAllowed(email, profile.hd)) throw new Error('Google login is not enabled for this email domain.');

  const googleId = String(profile.sub || profile.id || '').trim();
  const companyName = getCompanyNameForGoogleProfile(profile);
  const name = String(profile.name || profile.given_name || email.split('@')[0] || 'Google User').trim();

  let user = googleId ? await User.findOne({ googleId }) : null;
  if (!user) user = await User.findOne({ email });

  if (user) {
    const updates = {};
    if (googleId && !user.googleId) updates.googleId = googleId;
    if (!user.authProvider) updates.authProvider = 'google';
    if (profile.picture && !user.avatar) updates.avatar = profile.picture;
    if (!user.name && name) updates.name = name;
    if (Object.keys(updates).length) {
      user = await User.findByIdAndUpdate(user._id, { $set: updates }, { new: true });
    }
    return { user, role: user.role, userId: String(user._id), companyName: user.companyName || companyName, isNewUser: false };
  }

  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;
  const password = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), saltRounds);
  user = await User.create({
    googleId,
    authProvider: 'google',
    avatar: profile.picture || '',
    name,
    email,
    phone: `google-${googleId || crypto.randomBytes(8).toString('hex')}`,
    companyName,
    password,
    role: getDefaultGoogleRole(),
    status: 'active',
    isActive: true,
  });

  await ensureCompanyTrialForSsoUser({ companyName, userId: user._id, email });
  return { user, role: user.role, userId: String(user._id), companyName, isNewUser: true };
};

const assertSsoUserCanLogin = async ({ user, role }) => {
  const systemSettings = await systemSettingsService.getSettings();
  const supportMessage = buildSupportMessage(systemSettings?.platform?.supportEmail);
  const accountStatus = String(user.status || '').toLowerCase();

  if (accountStatus === 'locked') {
    const error = new Error(supportMessage);
    error.statusCode = 423;
    throw error;
  }

  if (accountStatus === 'inactive') {
    const error = new Error('Your account is inactive. Please contact your administrator.');
    error.statusCode = 403;
    throw error;
  }

  if (user.isActive === false) {
    const error = new Error('Please activate your account before logging in.');
    error.statusCode = 403;
    throw error;
  }

  if (systemSettings?.platform?.maintenanceMode && String(role || '').toLowerCase() !== 'superadmin') {
    const error = new Error('System is currently in maintenance mode. Please try again later.');
    error.statusCode = 503;
    throw error;
  }
};

const buildGoogleAuthorizationUrl = ({ loginHint = '' } = {}) => {
  const provider = getGoogleProvider();
  const missing = ['clientId', 'clientSecret'].filter((field) => !provider[field]);
  if (missing.length) {
    const error = new Error(`Google SSO is missing: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  const state = jwt.sign(
    {
      type: 'sso',
      providerKey: 'google',
      providerType: 'google',
      redirectUri: provider.redirectUri,
      nonce: crypto.randomBytes(16).toString('hex'),
    },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );

  const url = new URL(provider.authorizationUrl);
  url.searchParams.set('client_id', provider.clientId);
  url.searchParams.set('redirect_uri', provider.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', provider.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', process.env.GOOGLE_ACCESS_TYPE || 'offline');
  if (loginHint) url.searchParams.set('login_hint', loginHint);
  if (provider.prompt) url.searchParams.set('prompt', provider.prompt);
  if (process.env.GOOGLE_HOSTED_DOMAIN) url.searchParams.set('hd', process.env.GOOGLE_HOSTED_DOMAIN);

  return url.toString();
};

const startGoogleSso = async (req, res) => {
  try {
    const loginHint = String(req.query?.email || req.query?.login_hint || '').trim().toLowerCase();
    const redirectUrl = buildGoogleAuthorizationUrl({ loginHint });
    return res.redirect(redirectUrl);
  } catch (err) {
    return res.redirect(`${getFrontendOrigin()}/sso-login?sso_error=${encodeURIComponent(err.message || 'Google SSO is not configured.')}`);
  }
};

const startGoogleSsoJson = ({ email = '' } = {}) => {
  const redirectUrl = buildGoogleAuthorizationUrl({ loginHint: String(email || '').trim().toLowerCase() });
  return {
    redirectUrl,
    providerName: 'Google',
  };
};

const getGoogleSsoConfig = (req, res) => {
  const provider = getGoogleProvider();
  return res.json({
    configured: Boolean(provider.clientId && provider.clientSecret),
    redirectUri: provider.redirectUri,
    frontendUrl: getFrontendOrigin(),
    backendUrl: getBackendOrigin(),
    callbackPath: '/api/auth/google/callback',
  });
};

const initiateSso = async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const companyId = String(req.body?.companyId || '').trim();

  if (process.env.GOOGLE_CLIENT_ID && !companyId) {
    try {
      return res.json(startGoogleSsoJson({ email }));
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Google SSO is not configured.' });
    }
  }

  const match = findSsoProvider({ email, companyId });

  if (!match?.provider) {
    try {
      return res.json(startGoogleSsoJson({ email }));
    } catch (err) {
      return res.status(404).json({ error: err.message || 'Google SSO is not configured.' });
    }
  }

  const { key, provider } = match;
  const required = ['authorizationUrl', 'tokenUrl', 'clientId'];
  const missing = required.filter((field) => !provider[field]);
  if (missing.length) {
    return res.status(400).json({ error: `SSO provider is missing: ${missing.join(', ')}` });
  }

  const redirectUri = provider.redirectUri || `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/sso/callback`;
  const state = jwt.sign(
    { type: 'sso', providerKey: key, email, companyId, redirectUri },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );

  const url = new URL(provider.authorizationUrl);
  url.searchParams.set('client_id', provider.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', provider.responseType || 'code');
  url.searchParams.set('scope', provider.scope || 'openid email profile');
  url.searchParams.set('state', state);
  if (email) url.searchParams.set('login_hint', email);
  if (provider.audience) url.searchParams.set('audience', provider.audience);
  if (provider.prompt) url.searchParams.set('prompt', provider.prompt);

  return res.json({ redirectUrl: url.toString(), providerName: provider.providerName || 'Company SSO' });
};

const completeSso = async (req, res) => {
  const frontendCallback = `${getFrontendOrigin()}/sso-login`;
  try {
    const { code, state, error, error_description: errorDescription } = req.query || {};
    if (error) {
      return res.redirect(`${frontendCallback}?sso_error=${encodeURIComponent(errorDescription || error)}`);
    }
    if (!code || !state) {
      return res.redirect(`${frontendCallback}?sso_error=${encodeURIComponent('Missing SSO callback code or state.')}`);
    }

    const decodedState = jwt.verify(String(state), process.env.JWT_SECRET);
    if (decodedState?.type !== 'sso') throw new Error('Invalid SSO state.');
    const provider = getSsoProviders()[decodedState.providerKey];
    if (!provider) throw new Error('SSO provider is no longer configured.');

    const redirectUri = decodedState.redirectUri || provider.redirectUri || `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/sso/callback`;
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: redirectUri,
      client_id: provider.clientId,
    });
    if (provider.clientSecret) tokenBody.set('client_secret', provider.clientSecret);

    const tokenResponse = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: tokenBody,
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok) throw new Error(tokenData.error_description || tokenData.error || 'SSO token exchange failed.');

    let profile = {};
    if (provider.userInfoUrl && tokenData.access_token) {
      const profileResponse = await fetch(provider.userInfoUrl, {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
      });
      profile = await profileResponse.json().catch(() => ({}));
    }

    if (!profile.email && tokenData.id_token) {
      const [, payload] = String(tokenData.id_token).split('.');
      if (payload) {
        profile = {
          ...JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')),
          ...profile,
        };
      }
    }

    const email = String(profile.email || profile.upn || profile.preferred_username || decodedState.email || '').trim().toLowerCase();
    const found = decodedState.providerType === 'google' || provider.providerType === 'google'
      ? await findOrCreateGoogleUser(profile)
      : await findUserForSso(email);
    if (!found) throw new Error('No FixNest account exists for this SSO email.');

    await assertSsoUserCanLogin(found);
    const authPayload = await buildAuthResponse(found);
    await auditService.logEvent({
      actorId: String(found.userId),
      actorName: found.user.name,
      actorEmail: found.user.email,
      actorRole: found.role,
      companyName: found.companyName,
      action: 'auth.sso_success',
      entityType: 'auth',
      method: req.method,
      path: req.originalUrl,
      statusCode: 200,
      success: true,
      severity: 'info',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { providerKey: decodedState.providerKey, isNewUser: found.isNewUser === true },
    });

    const encoded = Buffer.from(JSON.stringify(authPayload)).toString('base64url');
    return res.redirect(`${frontendCallback}#sso=${encoded}`);
  } catch (err) {
    console.error('[SSO] Callback failed:', err);
    return res.redirect(`${frontendCallback}?sso_error=${encodeURIComponent(err.message || 'SSO login failed.')}`);
  }
};

const logFailedLoginThresholdAlert = async ({ email, ipAddress, userAgent, threshold }) => {
  const superadmins = await User.find({ role: 'superadmin', status: 'active' }, { _id: 1, email: 1, name: 1 }).lean();
  if (!superadmins.length) return;

  const title = 'Suspicious login attempts detected';
  const message = `${threshold} consecutive failed login attempts were detected for ${email || 'an unknown email'}${ipAddress ? ` from ${ipAddress}` : ''}. Review audit logs and consider enabling maintenance mode.`;
  const link = '/manager-dashboard?tab=settings';

  await Promise.all(superadmins.map(async (superadmin) => {
    await notificationService.createNotification({
      userId: String(superadmin._id),
      title,
      message,
      type: 'warning',
      link,
    });
  }));

  await emailService.sendSecurityAlert({
    recipients: superadmins,
    attemptedEmail: email,
    ipAddress,
    userAgent,
    threshold,
    dashboardUrl: buildDashboardLink(),
  });
};

const maybeAlertSuperadminOnFailedLogins = async ({ email, ipAddress, userAgent, settings }) => {
  if (!settings?.security?.notifyOnFailedLogin) return;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return;
  const threshold = Math.max(1, Math.min(Number(settings?.security?.maxLoginAttempts) || FAILED_LOGIN_ALERT_THRESHOLD, FAILED_LOGIN_ALERT_THRESHOLD));

  const latestAttempts = await AuditLog.find({
    actorEmail: normalizedEmail,
    action: { $in: ['auth.login_failed', 'auth.login_success'] },
  })
    .sort({ createdAt: -1 })
    .limit(threshold)
    .lean();

  if (latestAttempts.length < threshold) return;
  if (latestAttempts.some((entry) => entry.action !== 'auth.login_failed')) return;

  const windowStart = new Date(Date.now() - (15 * 60 * 1000));
  const duplicateAlert = await AuditLog.findOne({
    action: 'security.failed_login_threshold_triggered',
    actorEmail: normalizedEmail,
    createdAt: { $gte: windowStart },
  }).lean();

  if (duplicateAlert) return;

  await auditService.logEvent({
    actorEmail: normalizedEmail,
    action: 'security.failed_login_threshold_triggered',
    entityType: 'auth',
    success: false,
    severity: 'critical',
    ipAddress,
    userAgent,
    metadata: {
      attemptedEmail: normalizedEmail,
      ipAddress,
      threshold,
      recommendedActions: [
        'Review audit trail',
        'Verify whether the account owner recognizes the attempts',
        'Enable maintenance mode if the pattern continues',
      ],
    },
  });

  await logFailedLoginThresholdAlert({
    email: normalizedEmail,
    ipAddress,
    userAgent,
    threshold,
  });
};

const handleFailedLogin = async ({ req, settings, email, user = null, role = null, companyName = null, reason, metadata = {} }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  await auditService.logEvent({
    actorId: user ? String(user._id || user.id) : undefined,
    actorName: user?.name,
    actorEmail: normalizedEmail || undefined,
    actorRole: role || undefined,
    companyName: companyName || null,
    action: 'auth.login_failed',
    entityType: 'auth',
    method: req.method,
    path: req.originalUrl,
    statusCode: 401,
    success: false,
    severity: 'warning',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { reason, ...metadata },
  });

  await maybeAlertSuperadminOnFailedLogins({
    email: normalizedEmail,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    settings,
  });
};

const login = async (req, res) => {
  const { email, password, companyName: requestedCompany } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const systemSettings = await systemSettingsService.getSettings();
  const supportMessage = buildSupportMessage(systemSettings?.platform?.supportEmail);
  const blockedIpAddresses = (systemSettings?.security?.blockedIpAddresses || []).map((entry) => String(entry).trim()).filter(Boolean);
  const blockedAccountEmails = (systemSettings?.security?.blockedAccountEmails || []).map((entry) => String(entry).trim().toLowerCase()).filter(Boolean);

  if (blockedIpAddresses.includes(String(req.ip || '').trim())) {
    await auditService.logEvent({
      actorEmail: normalizedEmail || undefined,
      action: 'security.login_blocked_ip',
      entityType: 'auth',
      method: req.method,
      path: req.originalUrl,
      statusCode: 403,
      success: false,
      severity: 'critical',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { blockedIp: req.ip },
    });
    return res.status(403).json({ error: 'Login blocked for this IP address. Please contact support.' });
  }

  if (blockedAccountEmails.includes(normalizedEmail)) {
    await auditService.logEvent({
      actorEmail: normalizedEmail,
      action: 'security.login_blocked_account',
      entityType: 'auth',
      method: req.method,
      path: req.originalUrl,
      statusCode: 423,
      success: false,
      severity: 'critical',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { blockedAccount: normalizedEmail },
    });
    return res.status(423).json({ error: supportMessage });
  }

  // 1. Check Mongoose User collection (Clients, Managers, Admins)
  let user = await User.findOne({ email: normalizedEmail });
  let isTechnician = false;
  let techData = null;
  let isFromPrisma = false;

  // 2. If not found in Mongoose, check Prisma User (for superadmin created by bootstrap)
  if (!user) {
    const prismaUser = await prisma.user.findFirst({ 
      where: { email: normalizedEmail } 
    });
    if (prismaUser) {
      user = prismaUser;
      isFromPrisma = true;
    }
  }

  // 3. If still not found, check Technician collection (External Technicians)
  if (!user) {
    // Use findFirst instead of findUnique because email alone isn't unique (compound key with companyName)
    techData = await prisma.technician.findFirst({ 
      where: { email: normalizedEmail } 
    });
    if (techData && techData.password) {
      user = techData;
      isTechnician = true;
    }
  }

  if (!user) {
    await handleFailedLogin({
      req,
      settings: systemSettings,
      email: normalizedEmail,
      reason: 'user_not_found',
    });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const userId = isTechnician ? user.id : (isFromPrisma ? user.id : String(user._id));
  const role = isTechnician ? 'technician' : user.role;
  // Get company name from user (works for both Mongoose and Prisma)
  const companyName = isFromPrisma ? (user.companyName || null) : (user.companyName || null);
  
  // Resolve company ID so trial/subscription lookups can use the actual company record.
  let companyId = null;
  if (isFromPrisma && user.companyId) {
    companyId = user.companyId;
  }
  if (!companyId && companyName) {
    const companyRecord = await prisma.company.findUnique({
      where: { name: String(companyName).trim() },
      select: { id: true },
    }).catch(() => null);
    companyId = companyRecord?.id || null;
  }

  const accountStatus = String(user.status || '').toLowerCase();
  if (accountStatus === 'locked') {
    await auditService.logEvent({
      actorId: String(userId),
      actorName: user.name,
      actorEmail: user.email,
      actorRole: role,
      companyName,
      action: 'security.login_blocked_locked_account',
      entityType: 'auth',
      method: req.method,
      path: req.originalUrl,
      statusCode: 423,
      success: false,
      severity: 'critical',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    return res.status(423).json({ error: supportMessage });
  }

  if (systemSettings?.platform?.maintenanceMode && role !== 'superadmin') {
    await auditService.logEvent({
      actorId: String(userId),
      actorName: user.name,
      actorEmail: user.email,
      actorRole: role,
      companyName,
      action: 'auth.login_blocked_maintenance',
      entityType: 'auth',
      method: req.method,
      path: req.originalUrl,
      statusCode: 503,
      success: false,
      severity: 'warning',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    await emailService.sendMaintenanceModeNotice({
      email: user.email,
      name: user.name,
      appName: systemSettings?.platform?.appName,
      supportEmail: systemSettings?.platform?.supportEmail,
    });

    return res.status(503).json({
      error: 'System is currently in maintenance mode. Please try again later.',
    });
  }

  const storedPassword = isTechnician ? user.password : user.password;
  const valid = await bcrypt.compare(password, storedPassword);
  if (!valid) {
    await handleFailedLogin({
      req,
      settings: systemSettings,
      email: user.email,
      user,
      role,
      companyName,
      reason: 'invalid_password',
    });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!isTechnician && !user.isActive) {
    await auditService.logEvent({
      actorId: String(userId),
      actorName: user.name,
      actorEmail: user.email,
      actorRole: role,
      companyName,
      action: user.paymentPendingActivation === true ? 'auth.login_blocked_payment_pending' : 'auth.login_blocked_activation_pending',
      entityType: 'auth',
      method: req.method,
      path: req.originalUrl,
      statusCode: 403,
      success: false,
      severity: 'warning',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { reason: user.paymentPendingActivation === true ? 'payment_pending' : 'activation_pending', paymentPending: user.paymentPendingActivation === true }
    });
    
    return res.status(403).json({
      error: user.paymentPendingActivation === true
        ? 'Payment required to activate account'
        : 'Please activate your account from the email we sent before logging in.',
      status: user.paymentPendingActivation === true ? 'payment_pending' : 'activation_pending',
      message: user.paymentPendingActivation === true
        ? 'Your account is pending payment. Please check your email for payment instructions.'
        : 'Your account is pending email activation. Please check your inbox for the activation link.',
      email: user.email,
      requiresPayment: user.paymentPendingActivation === true
    });
  }

  // Optional company gate: if client passes companyName, ensure it matches stored record
  if (requestedCompany && companyName && requestedCompany.trim().toLowerCase() !== companyName.trim().toLowerCase()) {
    await handleFailedLogin({
      req,
      settings: systemSettings,
      email: user.email,
      user,
      role,
      companyName,
      reason: 'invalid_company',
      metadata: { requestedCompany },
    });
    return res.status(401).json({ error: 'Invalid company' });
  }

  const authPayload = await buildAuthResponse({ user, role, userId, companyName });

  await auditService.logEvent({
    actorId: String(userId),
    actorName: user.name,
    actorEmail: user.email,
    actorRole: role,
    companyName,
    action: 'auth.login_success',
    entityType: 'auth',
    method: req.method,
    path: req.originalUrl,
    statusCode: 200,
    success: true,
    severity: 'info',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json(authPayload);
};

module.exports = login;
module.exports.login = login;
module.exports.initiateSso = initiateSso;
module.exports.completeSso = completeSso;
module.exports.startGoogleSso = startGoogleSso;
module.exports.getGoogleSsoConfig = getGoogleSsoConfig;
