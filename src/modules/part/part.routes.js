const express = require('express');
const controller = require('./part.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.get('/', authenticate, controller.list);
router.post('/bulk', authenticate, controller.bulk);
router.get('/:id', controller.getById);
router.get('/:id/sets', authenticate, controller.getSets);
router.post('/', authenticate, controller.create);
router.put('/:id', authenticate, controller.update);
router.post('/:id/adjust', authenticate, controller.adjustQuantity);
router.delete('/:id', controller.remove);

module.exports = router;
