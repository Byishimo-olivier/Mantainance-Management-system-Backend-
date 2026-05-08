const express = require('express');
const controller = require('./maintenanceTemplate.controller');
const { authenticate } = require('../../middleware/auth');
const { requireFeature, requireFeatureWrite } = require('../../middleware/trial');
const router = express.Router();

router.post('/', authenticate, requireFeatureWrite('preventive_maintenance'), controller.create);
router.get('/', authenticate, requireFeature('preventive_maintenance'), controller.getAll);
router.get('/:id', authenticate, requireFeature('preventive_maintenance'), controller.getById);
router.put('/:id', authenticate, requireFeatureWrite('preventive_maintenance'), controller.update);
router.delete('/:id', authenticate, requireFeatureWrite('preventive_maintenance'), controller.remove);

module.exports = router;
