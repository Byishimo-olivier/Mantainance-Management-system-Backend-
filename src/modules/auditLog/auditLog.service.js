const AuditLog = require('./auditLog.model');

const sanitizeMetadata = (metadata = {}) => {
  const blockedKeys = new Set(['password', 'token', 'authorization', 'secret', 'secretId', 'jwt']);
  return Object.entries(metadata || {}).reduce((acc, [key, value]) => {
    if (blockedKeys.has(String(key).toLowerCase())) return acc;
    acc[key] = value;
    return acc;
  }, {});
};

exports.logEvent = async (payload = {}) => {
  try {
    return await AuditLog.create({
      ...payload,
      metadata: sanitizeMetadata(payload.metadata),
    });
  } catch (err) {
    console.error('[auditLog.logEvent]', err.message);
    return null;
  }
};

exports.getLogs = async ({ limit = 100, action, actorRole, success, search } = {}) => {
  const query = {};
  if (action) query.action = action;
  if (actorRole) query.actorRole = actorRole;
  if (typeof success === 'boolean') query.success = success;
  if (search) {
    const regex = new RegExp(String(search).trim(), 'i');
    query.$or = [
      { actorName: regex },
      { actorEmail: regex },
      { actorRole: regex },
      { action: regex },
      { entityType: regex },
      { entityId: regex },
      { path: regex },
      { companyName: regex },
      { ipAddress: regex },
      { userAgent: regex },
      { severity: regex },
    ];
  }
  return AuditLog.find(query).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).lean();
};

exports.getSummary = async () => {
  const since = new Date(Date.now() - (24 * 60 * 60 * 1000));
  const [totalEvents, failedLogins24h, successfulLogins24h, sensitiveChanges24h] = await Promise.all([
    AuditLog.countDocuments({}),
    AuditLog.countDocuments({ action: 'auth.login_failed', createdAt: { $gte: since } }),
    AuditLog.countDocuments({ action: 'auth.login_success', createdAt: { $gte: since } }),
    AuditLog.countDocuments({ severity: 'warning', createdAt: { $gte: since } }),
  ]);

  return {
    totalEvents,
    failedLogins24h,
    successfulLogins24h,
    sensitiveChanges24h,
  };
};
