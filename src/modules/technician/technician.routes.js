const express = require('express');
const ctrl = require('./technician.controller');
const { authenticate, authorizeRoles, optionalAuthenticate } = require('../../middleware/auth.js');
const router = express.Router();

// Listing is company-scoped: anonymous callers get an empty list (see controller).
router.get('/', optionalAuthenticate, ctrl.getAll);
// Provide a manager/admin endpoint to fetch technicians for assignment
router.get('/for-assignment', authenticate, authorizeRoles('admin', 'manager', 'client', 'requestor'), ctrl.getForAssignment);
router.get('/:id', authenticate, ctrl.getById);
router.post('/', authenticate, authorizeRoles('admin', 'manager'), ctrl.create);
// Invite external technician via email (admin/manager)
router.post('/invite', authenticate, authorizeRoles('admin', 'manager'), ctrl.invite);
router.put('/:id', authenticate, authorizeRoles('admin', 'manager'), ctrl.update);
router.delete('/:id', authenticate, authorizeRoles('admin', 'manager', 'client'), ctrl.delete);

module.exports = router;
