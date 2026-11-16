
const express = require('express');
const controller = require('./property.controller');
const upload = require('../../middleware/upload');
const { authenticate } = require('../../middleware/auth');
const { requireFeature, requireFeatureWrite } = require('../../middleware/trial');
const { requireCompanyRecord } = require('../../middleware/companyOwnership');
const ownRecord = requireCompanyRecord('Property');
const ownRecordOrPublic = requireCompanyRecord('Property', { allowAnonymous: true });
const router = express.Router();


router.post('/', authenticate, requireFeatureWrite('location_management'), controller.create);
const { optionalAuthenticate } = require('../../middleware/auth');
router.get('/', optionalAuthenticate, requireFeature('location_management', { allowAnonymous: true }), controller.getAll);
router.get('/:id', optionalAuthenticate, ownRecordOrPublic, requireFeature('location_management', { allowAnonymous: true }), controller.getById);
router.put('/:id', authenticate, ownRecord, requireFeatureWrite('location_management'), controller.update);
router.delete('/:id', authenticate, ownRecord, requireFeatureWrite('location_management'), controller.remove);

// Upload photos for a property (multipart/form-data, field name: photos)
router.post('/:id/photos', authenticate, ownRecord, requireFeatureWrite('location_management'), upload.array('photos', 10), controller.uploadPhotos);

module.exports = router;
