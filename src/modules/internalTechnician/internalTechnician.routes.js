const express = require('express');
const controller = require('./internalTechnician.controller');
const router = express.Router();

router.post('/', controller.create);
router.get('/', controller.getAll);
router.get('/by-property/:propertyId', controller.getByProperty);
router.get('/:id', controller.getById);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
