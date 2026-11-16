const express = require('express');
const controller = require('./internalTechnician.controller');
const { authenticate, authorizeRoles, optionalAuthenticate } = require('../../middleware/auth');
const router = express.Router();

const canManage = authorizeRoles('admin', 'manager', 'client');

router.post('/', authenticate, canManage, controller.create);
router.get('/', authenticate, controller.getAll);
// Public request form lists a location's technicians (names only for anonymous callers).
router.get('/by-property/:propertyId', optionalAuthenticate, controller.getByProperty);
router.get('/:id', authenticate, controller.getById);
router.put('/:id', authenticate, canManage, controller.update);
router.delete('/:id', authenticate, canManage, controller.remove);

module.exports = router;
