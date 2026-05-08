const express = require('express');
const { authenticate, authorizeRoles } = require('../../middleware/auth');
const { requireFeature, requireFeatureWrite } = require('../../middleware/trial');
const controller = require('./analyticsPreference.controller');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles('admin', 'manager', 'client', 'technician', 'requestor', 'staff'));

router.get('/', requireFeature('analytics'), controller.getPreferences);
router.put('/', requireFeatureWrite('analytics'), controller.updatePreferences);

module.exports = router;
