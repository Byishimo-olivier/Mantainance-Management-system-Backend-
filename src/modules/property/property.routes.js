
const express = require('express');
const controller = require('./property.controller');
const upload = require('../../middleware/upload');
const { authenticate } = require('../../middleware/auth');
const router = express.Router();


router.post('/', authenticate, controller.create);
const { optionalAuthenticate } = require('../../middleware/auth');
router.get('/', optionalAuthenticate, controller.getAll);
router.get('/:id', optionalAuthenticate, controller.getById);
router.put('/:id', authenticate, controller.update);
router.delete('/:id', authenticate, controller.remove);

// Upload photos for a property (multipart/form-data, field name: photos)
router.post('/:id/photos', upload.array('photos', 10), controller.uploadPhotos);

module.exports = router;
