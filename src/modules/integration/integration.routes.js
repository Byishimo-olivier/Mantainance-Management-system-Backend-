const express = require('express');
const ctrl = require('./integration.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/dynamics365/config', ctrl.getDynamics365Config);
router.put('/dynamics365/config', ctrl.saveDynamics365Config);
router.post('/dynamics365/test', ctrl.testDynamics365Connection);
router.post('/dynamics365/sync-preview', ctrl.syncDynamics365Preview);

module.exports = router;
