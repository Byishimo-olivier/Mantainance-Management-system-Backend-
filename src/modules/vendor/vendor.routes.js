const express = require('express');
const controller = require('./vendor.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.get('/', authenticate, controller.listVendors);
router.post('/', authenticate, controller.createVendor);
router.post('/bulk', authenticate, controller.bulk);
router.delete('/:id', controller.remove);

module.exports = router;
