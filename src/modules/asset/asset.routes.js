
const express = require('express');
const controller = require('./asset.controller');
const { authenticate, optionalAuthenticate } = require('../../middleware/auth');
const router = express.Router();

router.get('/count', optionalAuthenticate, controller.count);

router.post('/', authenticate, controller.create);
router.get('/', optionalAuthenticate, controller.getAll);
router.get('/:id', optionalAuthenticate, controller.getById);
router.put('/:id', authenticate, controller.update);
router.patch('/:id/status', authenticate, controller.updateStatus);
router.delete('/:id', authenticate, controller.remove);
// Movement and spare parts
router.post('/:id/move', authenticate, controller.move);
router.get('/:id/movements', optionalAuthenticate, controller.getMovements);
router.post('/:id/spare-parts', authenticate, controller.addSparePart);
router.get('/:id/spare-parts', optionalAuthenticate, controller.listSpareParts);
router.post('/:id/downtime', authenticate, controller.addDowntime);
router.get('/:id/downtime', optionalAuthenticate, controller.getDowntime);

module.exports = router;
