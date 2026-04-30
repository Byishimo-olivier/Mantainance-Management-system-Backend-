const express = require('express');
const { authenticate } = require('../../middleware/auth');
const controller = require('./quoteRequest.controller');

const router = express.Router();

router.post('/', authenticate, controller.create);
router.get('/', authenticate, controller.getAll);
router.patch('/:id/status', authenticate, controller.updateStatus);

module.exports = router;
