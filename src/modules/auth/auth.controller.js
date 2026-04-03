const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const User = require('../user/user.model.js');
const auditService = require('../auditLog/auditLog.service');
const AuditLog = require('../auditLog/auditLog.model');
const systemSettingsService = require('../systemSettings/systemSettings.service');
const notificationService = require('../notification/notification.service');
const emailService = require('../emailService/email.service');
const prisma = new PrismaClient();

const FAILED_LOGIN_ALERT_THRESHOLD = 3;

const buildDashboardLink = () => `${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager-dashboard?tab=settings`;
const buildSupportMessage = (supportEmail) => supportEmail
  ? `Your account is locked. Please contact support at ${supportEmail}.`
  : 'Your account is locked. Please contact support.';

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

  // 1. Check User collection (Clients, Managers, Admins)
  let user = await User.findOne({ email: normalizedEmail });
  let isTechnician = false;
  let techData = null;

  if (!user) {
    // 2. Check Technician collection (External Technicians)
    techData = await prisma.technician.findUnique({ where: { email: normalizedEmail } });
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

  const userId = isTechnician ? user.id : user._id;
  const role = isTechnician ? 'technician' : user.role;
  const companyName = user.companyName || techData?.companyName || null;

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

  // Check if account is activated (only block if explicitly required payment)
  if (!isTechnician && user.paymentPendingActivation === true && !user.isActive) {
    await auditService.logEvent({
      actorId: String(userId),
      actorName: user.name,
      actorEmail: user.email,
      actorRole: role,
      companyName,
      action: 'auth.login_blocked_payment_pending',
      entityType: 'auth',
      method: req.method,
      path: req.originalUrl,
      statusCode: 403,
      success: false,
      severity: 'warning',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { reason: 'payment_pending', paymentPending: true }
    });
    
    return res.status(403).json({ 
      error: 'Payment required to activate account',
      status: 'payment_pending',
      message: 'Your account is pending payment. Please check your email for payment instructions.',
      email: user.email,
      requiresPayment: true
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

  const token = jwt.sign({ userId, role, companyName }, process.env.JWT_SECRET, { expiresIn: '24h' });

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

  res.json({
    token,
    user: {
      _id: userId,
      id: String(userId),
      name: user.name,
      email: user.email,
      role: role,
      companyName,
      companyId: String(userId),
      companyType: user.companyType || 'main',
      branchName: user.branchName || '',
      branchDetails: user.branchDetails || ''
    }
  });
};

module.exports = login;
