const express = require('express');
const controller = require('./maintenanceSchedule.controller');
const { authenticate } = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const router = express.Router();

const maintenanceUpload = upload.fields([
  { name: 'photos', maxCount: 10 },
  { name: 'files', maxCount: 10 },
]);

router.post('/', authenticate, maintenanceUpload, controller.create);
router.get('/technician/:id', authenticate, controller.getForTechnician);
router.get('/', authenticate, controller.getAll);
router.get('/:id', controller.getById);
router.post('/:id/dismiss', authenticate, controller.dismiss);
router.post('/:id/snooze', authenticate, controller.snooze);
router.post('/:id/emailReminder', authenticate, controller.emailReminder);
router.get('/:id/reminder-logs', controller.getReminderLogs);
router.put('/:id', authenticate, controller.update);
router.delete('/:id', authenticate, controller.remove);

module.exports = router;
