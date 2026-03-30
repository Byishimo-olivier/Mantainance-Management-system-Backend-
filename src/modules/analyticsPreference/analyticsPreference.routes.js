const express = require('express');
const { authenticate, authorizeRoles } = require('../../middleware/auth');
const controller = require('./analyticsPreference.controller');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles('admin', 'manager', 'client', 'technician', 'requestor', 'staff'));

router.get('/', controller.getPreferences);
router.put('/', controller.updatePreferences);

module.exports = router;
