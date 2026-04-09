const express = require('express');
const controller = require('./purchaseOrder.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.get('/', authenticate, controller.list);
router.get('/public/:token', controller.getPublicByToken);
router.post('/public/:token/respond', controller.respondPublic);
router.get('/:id', controller.getOne);
router.post('/', authenticate, controller.create);
router.put('/:id', authenticate, controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
