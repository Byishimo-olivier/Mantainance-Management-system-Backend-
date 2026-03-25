const auditService = require('../modules/auditLog/auditLog.service');

const sanitizeBodyKeys = (body = {}) => Object.keys(body || {}).filter((key) => !['password', 'token', 'secret', 'secretId'].includes(String(key).toLowerCase()));

const shouldLogRequest = (req) => {
  if (!req.originalUrl?.startsWith('/api')) return false;
  if (req.originalUrl.startsWith('/api/health') || req.originalUrl.startsWith('/api/_routes')) return false;
  if (req.originalUrl.startsWith('/api/auth/login')) return false;
  if (req.method === 'OPTIONS') return false;
  if (req.user) return true;
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
};

const getEntityType = (path = '') => {
  const [, apiSegment, entity] = String(path).split('/');
  return entity || apiSegment || 'system';
};

const auditRequests = (req, res, next) => {
  res.on('finish', () => {
    if (!shouldLogRequest(req)) return;
    const success = res.statusCode < 400;
    auditService.logEvent({
      actorId: req.user?.userId || null,
      actorName: req.user?.name || null,
      actorEmail: req.user?.email || null,
      actorRole: req.user?.role || 'anonymous',
      companyName: req.user?.companyName || null,
      action: `api.${String(req.method || 'GET').toLowerCase()}`,
      entityType: getEntityType(req.originalUrl),
      entityId: req.params?.id || null,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      success,
      severity: success ? 'info' : 'warning',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        query: req.query,
        bodyKeys: sanitizeBodyKeys(req.body),
      },
    });
  });

  next();
};

module.exports = { auditRequests };
