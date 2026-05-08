const express = require('express');
const controller = require('./maintenanceSchedule.controller');
const { authenticate } = require('../../middleware/auth');
const { requireFeature, requireFeatureWrite } = require('../../middleware/trial');
const upload = require('../../middleware/upload');
const router = express.Router();

const maintenanceUpload = upload.fields([
  { name: 'photos', maxCount: 10 },
  { name: 'files', maxCount: 10 },
]);

router.post('/', authenticate, requireFeatureWrite('preventive_maintenance'), maintenanceUpload, controller.create);
router.get('/technician/:id', authenticate, requireFeature('preventive_maintenance'), controller.getForTechnician);
router.get('/', authenticate, requireFeature('preventive_maintenance'), controller.getAll);
router.get('/:id', authenticate, requireFeature('preventive_maintenance'), controller.getById);
router.post('/:id/dismiss', authenticate, requireFeatureWrite('preventive_maintenance'), controller.dismiss);
router.post('/:id/snooze', authenticate, requireFeatureWrite('preventive_maintenance'), controller.snooze);
router.post('/:id/emailReminder', authenticate, requireFeatureWrite('preventive_maintenance'), controller.emailReminder);
router.get('/:id/reminder-logs', authenticate, requireFeature('preventive_maintenance'), controller.getReminderLogs);
router.put('/:id', authenticate, requireFeatureWrite('preventive_maintenance'), controller.update);
router.delete('/:id', authenticate, requireFeatureWrite('preventive_maintenance'), controller.remove);

// PM Auto-Generation endpoints
router.post('/:id/generate-instances', authenticate, requireFeatureWrite('preventive_maintenance'), controller.generatePMInstances);
router.get('/:id/instances', authenticate, requireFeature('preventive_maintenance'), controller.getPMInstances);
router.post('/auto-gen/trigger', authenticate, requireFeatureWrite('preventive_maintenance'), controller.triggerAutoGeneration);

module.exports = router;
