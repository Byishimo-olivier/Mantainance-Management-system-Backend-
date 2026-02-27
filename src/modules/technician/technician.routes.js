const express = require('express');
const ctrl = require('./technician.controller');
const { authenticate, authorizeRoles } = require('../../middleware/auth.js');
const router = express.Router();

// Public GETs allowed for listing technicians; protected endpoints keep authentication
router.get('/', ctrl.getAll);
// Provide a manager/admin endpoint to fetch technicians for assignment
router.get('/for-assignment', authenticate, authorizeRoles('admin', 'manager'), ctrl.getForAssignment);
router.get('/:id', ctrl.getById);
router.post('/', authenticate, authorizeRoles('admin', 'manager'), ctrl.create);
// Invite external technician via email (admin/manager)
router.post('/invite', authenticate, authorizeRoles('admin', 'manager'), ctrl.invite);
router.put('/:id', authenticate, authorizeRoles('admin', 'manager'), ctrl.update);
router.delete('/:id', authenticate, authorizeRoles('admin', 'manager'), ctrl.delete);

module.exports = router;
