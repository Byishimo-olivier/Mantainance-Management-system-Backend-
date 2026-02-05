const express = require('express');
const controller = require('./maintenanceSchedule.controller');
const router = express.Router();

router.post('/', controller.create);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/:id/dismiss', controller.dismiss);
router.post('/:id/snooze', controller.snooze);
router.post('/:id/emailReminder', controller.emailReminder);
router.get('/:id/reminder-logs', controller.getReminderLogs);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
