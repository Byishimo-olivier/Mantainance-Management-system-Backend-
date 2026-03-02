const express = require('express');
const ctrl = require('./device.controller');
const router = express.Router();

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.delete);
router.post('/:id/actions/:action', ctrl.action);

module.exports = router;
