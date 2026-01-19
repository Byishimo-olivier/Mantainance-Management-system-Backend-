const express = require('express');
const ctrl = require('./technician.controller');
const { authenticate, authorizeRoles } = require('../../middleware/auth.js');
const router = express.Router();

// All technician routes require authentication
router.use(authenticate);

// Only technicians and admins can access technician routes
router.use(authorizeRoles('technician', 'admin'));

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.delete);

module.exports = router;
