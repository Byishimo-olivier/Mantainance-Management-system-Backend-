const express = require('express');
const ctrl = require('./checklist.controller');
const { authenticate, optionalAuthenticate } = require('../../middleware/auth');
const router = express.Router();

router.get('/', optionalAuthenticate, ctrl.getAll);
router.get('/:id', optionalAuthenticate, ctrl.getById);
router.post('/', optionalAuthenticate, ctrl.create);
router.post('/bulk', optionalAuthenticate, ctrl.bulkCreate);
router.post('/import', optionalAuthenticate, ctrl.importCsv);
router.put('/:id', authenticate, ctrl.update);
router.delete('/:id', authenticate, ctrl.delete);

module.exports = router;
