const express = require('express');
const controller = require('./vendor.controller');

const router = express.Router();

router.get('/', controller.listVendors);
router.post('/', controller.createVendor);
router.post('/bulk', controller.bulk);
router.delete('/:id', controller.remove);

module.exports = router;
