const express = require('express');
const controller = require('./purchaseOrder.controller');
const { authenticate } = require('../../middleware/auth');
const { requireFeature, requireFeatureWrite } = require('../../middleware/trial');

const router = express.Router();

router.get('/', authenticate, requireFeature('purchase_order'), controller.list);
router.get('/public/:token', controller.getPublicByToken);
router.post('/public/:token/respond', controller.respondPublic);
router.get('/:id', authenticate, requireFeature('purchase_order'), controller.getOne);
router.post('/', authenticate, requireFeatureWrite('purchase_order'), controller.create);
router.put('/:id', authenticate, requireFeatureWrite('purchase_order'), controller.update);
router.delete('/:id', authenticate, requireFeatureWrite('purchase_order'), controller.remove);

module.exports = router;
