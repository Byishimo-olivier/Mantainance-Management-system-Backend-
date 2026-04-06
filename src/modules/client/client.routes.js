const express = require('express');
const controller = require('../vendor/vendor.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.get('/', authenticate, controller.listClients);
router.post('/', authenticate, controller.createClient);
router.post('/bulk', authenticate, controller.bulk);
router.delete('/:id', controller.remove);

module.exports = router;
