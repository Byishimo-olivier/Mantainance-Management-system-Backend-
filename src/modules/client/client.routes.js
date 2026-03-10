const express = require('express');
const controller = require('../vendor/vendor.controller');

const router = express.Router();

router.get('/', controller.listClients);
router.post('/', controller.createClient);
router.post('/bulk', controller.bulk);
router.delete('/:id', controller.remove);

module.exports = router;
