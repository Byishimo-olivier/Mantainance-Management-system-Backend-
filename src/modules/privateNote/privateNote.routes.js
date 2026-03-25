const express = require('express');
const router = express.Router();
const controller = require('./privateNote.controller');
const { authenticate } = require('../../middleware/auth');

router.get('/me', authenticate, controller.getMine);
router.put('/me', authenticate, controller.upsertMine);

module.exports = router;
