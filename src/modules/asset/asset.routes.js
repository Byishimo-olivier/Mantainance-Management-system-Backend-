
const express = require('express');
const controller = require('./asset.controller');
const { authenticate, optionalAuthenticate } = require('../../middleware/auth');
const { requireFeature, requireFeatureWrite } = require('../../middleware/trial');
const router = express.Router();

router.get('/count', optionalAuthenticate, requireFeature('asset_tracking', { allowAnonymous: true }), controller.count);

router.post('/', authenticate, requireFeatureWrite('asset_tracking'), controller.create);
router.get('/', optionalAuthenticate, requireFeature('asset_tracking', { allowAnonymous: true }), controller.getAll);
router.get('/:id', optionalAuthenticate, requireFeature('asset_tracking', { allowAnonymous: true }), controller.getById);
router.put('/:id', authenticate, requireFeatureWrite('asset_tracking'), controller.update);
router.patch('/:id/status', authenticate, requireFeatureWrite('asset_tracking'), controller.updateStatus);
router.delete('/:id', authenticate, requireFeatureWrite('asset_tracking'), controller.remove);
// Movement and spare parts
router.post('/:id/move', authenticate, requireFeatureWrite('asset_tracking'), controller.move);
router.get('/:id/movements', optionalAuthenticate, requireFeature('asset_tracking', { allowAnonymous: true }), controller.getMovements);
router.post('/:id/spare-parts', authenticate, requireFeatureWrite('asset_tracking'), controller.addSparePart);
router.get('/:id/spare-parts', optionalAuthenticate, requireFeature('asset_tracking', { allowAnonymous: true }), controller.listSpareParts);
router.post('/:id/downtime', authenticate, requireFeatureWrite('asset_tracking'), controller.addDowntime);
router.get('/:id/downtime', optionalAuthenticate, requireFeature('asset_tracking', { allowAnonymous: true }), controller.getDowntime);

module.exports = router;
