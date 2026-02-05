const express = require('express');
const controller = require('./property.controller');
const upload = require('../../middleware/upload');
const router = express.Router();

router.post('/', controller.create);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

// Upload photos for a property (multipart/form-data, field name: photos)
router.post('/:id/photos', upload.array('photos', 10), controller.uploadPhotos);

module.exports = router;
