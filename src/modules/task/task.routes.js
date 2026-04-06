const express = require('express');
const controller = require('./task.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.get('/', authenticate, controller.list);
router.get('/:id', authenticate, controller.getById);
router.post('/', authenticate, controller.create);
router.put('/:id', authenticate, controller.update);
router.patch('/:id/status', authenticate, controller.updateStatus);
router.post('/:id/checklist', authenticate, controller.addChecklistItem);
router.patch('/:id/checklist', authenticate, controller.toggleChecklistItem);
router.delete('/:id/checklist', authenticate, controller.removeChecklistItem);
router.delete('/:id', authenticate, controller.delete);

module.exports = router;
