
const express = require('express');
const controller = require('./asset.controller');
const router = express.Router();

router.get('/count', controller.count);

router.post('/', controller.create);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
// Movement and spare parts
router.post('/:id/move', controller.move);
router.get('/:id/movements', controller.getMovements);
router.post('/:id/spare-parts', controller.addSparePart);
router.get('/:id/spare-parts', controller.listSpareParts);

module.exports = router;
