const express = require('express');
const controller = require('./part.controller');

const router = express.Router();

router.get('/', controller.list);
router.post('/', controller.create);
router.post('/bulk', controller.bulk);
router.delete('/:id', controller.remove);

module.exports = router;
