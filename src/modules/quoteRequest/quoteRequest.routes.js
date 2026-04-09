const express = require('express');
const { authenticate } = require('../../middleware/auth');
const controller = require('./quoteRequest.controller');

const router = express.Router();

router.post('/', authenticate, controller.create);

module.exports = router;
