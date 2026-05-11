const express = require('express');
const router = express.Router();
const controller = require('./materialRequest.controller');
const auth = require('../../middleware/auth');
const { requireFeature, requireFeatureWrite } = require('../../middleware/trial');

router.get('/', auth.optionalAuthenticate, requireFeature('material_requests', { allowAnonymous: true }), controller.getAll);
router.get('/tech/:techId', auth.optionalAuthenticate, requireFeature('material_requests', { allowAnonymous: true }), controller.getByTechnician);
router.post('/', auth.authenticate, requireFeatureWrite('material_requests'), controller.create);
router.post('/:id/forward', auth.authenticate, requireFeatureWrite('material_requests'), controller.forwardToClient);
router.post('/:id/respond', auth.authenticate, requireFeatureWrite('material_requests'), controller.clientRespond);
router.post('/:id/approve-with-stock-check', auth.authenticate, requireFeatureWrite('material_requests'), controller.approveWithStockCheck);
router.post('/:id/generate-po-data', auth.authenticate, requireFeatureWrite('material_requests'), controller.generatePOData);
router.put('/:id', auth.authenticate, requireFeatureWrite('material_requests'), controller.update);
router.delete('/:id', auth.authenticate, requireFeatureWrite('material_requests'), controller.remove);

module.exports = router;

