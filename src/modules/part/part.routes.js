const express = require('express');
const controller = require('./part.controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.post('/bulk', controller.bulk);
router.put('/:id', controller.update);
router.post('/:id/adjust', controller.adjustQuantity);
router.delete('/:id', controller.remove);

module.exports = router;
