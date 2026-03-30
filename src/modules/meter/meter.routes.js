const express = require('express');
const ctrl = require('./meter.controller');
const { optionalAuthenticate } = require('../../middleware/auth');
const router = express.Router();

router.use(optionalAuthenticate);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.delete);

module.exports = router;
