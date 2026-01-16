
const express = require('express');
const ctrl = require('./issue.controller');
const upload = require('../../middleware/upload');
const { authenticate, authorizeRoles } = require('../../middleware/auth');
const router = express.Router();

// Technician uploads BEFORE evidence (address, before image, fix time)
router.post('/:id/evidence/before', authenticate, authorizeRoles('TECH'), ctrl.uploadBeforeEvidence);
// Technician uploads AFTER evidence (after image)
router.post('/:id/evidence/after', authenticate, authorizeRoles('TECH'), ctrl.uploadAfterEvidence);

// Assign an issue to a technician (admin/manager only)
router.post('/:id/assign', authenticate, authorizeRoles('ADMIN', 'MANAGER'), ctrl.assignToTech);

// Admin: all issues, Tech: assigned, User: own
router.get('/', authenticate, ctrl.getByRole);
router.get('/user/:userId', authenticate, authorizeRoles('CLIENT'), ctrl.getByUserId);
router.get('/assigned/:techId', authenticate, authorizeRoles('TECH'), ctrl.getByAssignedTech);
router.get('/:id', authenticate, ctrl.getById);                                             
router.post('/', authenticate, upload.single('photo'), ctrl.create);
router.put('/:id', authenticate, ctrl.update);
router.delete('/:id', authenticate, ctrl.delete);

module.exports = router;
