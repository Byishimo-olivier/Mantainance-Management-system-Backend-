const express = require('express');
const controller = require('./maintenanceSchedule.controller');
const { authenticate } = require('../../middleware/auth');
const router = express.Router();

router.post('/', authenticate, controller.create);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/:id/dismiss', authenticate, controller.dismiss);
router.post('/:id/snooze', authenticate, controller.snooze);
router.post('/:id/emailReminder', authenticate, controller.emailReminder);
router.get('/:id/reminder-logs', controller.getReminderLogs);
router.put('/:id', authenticate, controller.update);
router.delete('/:id', authenticate, controller.remove);

module.exports = router;
