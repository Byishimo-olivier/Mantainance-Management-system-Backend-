const express = require('express');
const ctrl = require('./systemSettings.controller');
const { authenticate, authorizeRoles } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles('superadmin'));
router.get('/', ctrl.getSettings);
router.put('/', ctrl.updateSettings);

module.exports = router;
