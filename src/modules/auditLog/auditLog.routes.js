const express = require('express');
const ctrl = require('./auditLog.controller');
const { authenticate, authorizeRoles } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles('superadmin'));
router.get('/', ctrl.getAuditLogs);
router.post('/security-action', ctrl.applySecurityAction);

module.exports = router;
