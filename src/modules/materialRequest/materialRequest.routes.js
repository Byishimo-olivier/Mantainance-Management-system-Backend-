const express = require('express');
const router = express.Router();
const controller = require('./materialRequest.controller');
const auth = require('../../middleware/auth');

router.get('/', auth.optionalAuthenticate, controller.getAll);
router.get('/tech/:techId', auth.optionalAuthenticate, controller.getByTechnician);
router.post('/', auth.authenticate, controller.create);
router.put('/:id', auth.authenticate, controller.update);
router.delete('/:id', auth.authenticate, controller.remove);

module.exports = router;
