const express = require('express');
const controller = require('./inventorySet.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.get('/', authenticate, controller.list);
router.post('/', authenticate, controller.create);
router.put('/:id', authenticate, controller.update);
router.delete('/:id', authenticate, controller.remove);
router.get('/:id/with-parts', authenticate, controller.getWithParts);
router.get('/:id/parts', authenticate, controller.getParts);
router.post('/:id/add-part', authenticate, controller.addPart);
router.post('/:id/remove-part', authenticate, controller.removePart);

module.exports = router;
