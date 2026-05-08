
const express = require('express');
const controller = require('./property.controller');
const upload = require('../../middleware/upload');
const { authenticate } = require('../../middleware/auth');
const { requireFeature, requireFeatureWrite } = require('../../middleware/trial');
const router = express.Router();


router.post('/', authenticate, requireFeatureWrite('location_management'), controller.create);
const { optionalAuthenticate } = require('../../middleware/auth');
router.get('/', optionalAuthenticate, requireFeature('location_management', { allowAnonymous: true }), controller.getAll);
router.get('/:id', optionalAuthenticate, requireFeature('location_management', { allowAnonymous: true }), controller.getById);
router.put('/:id', authenticate, requireFeatureWrite('location_management'), controller.update);
router.delete('/:id', authenticate, requireFeatureWrite('location_management'), controller.remove);

// Upload photos for a property (multipart/form-data, field name: photos)
router.post('/:id/photos', authenticate, requireFeatureWrite('location_management'), upload.array('photos', 10), controller.uploadPhotos);

module.exports = router;
