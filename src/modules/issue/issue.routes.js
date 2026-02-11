
const express = require('express');
const ctrl = require('./issue.controller');
const upload = require('../../middleware/upload');
const { authenticate, authorizeRoles, optionalAuthenticate } = require('../../middleware/auth');
const router = express.Router();

// Technician uploads BEFORE evidence (address, before image, fix time)
router.post('/:id/evidence/before', authenticate, authorizeRoles('technician'), ctrl.uploadBeforeEvidence);
// Technician uploads AFTER evidence (after image)
router.post('/:id/evidence/after', authenticate, authorizeRoles('technician'), ctrl.uploadAfterEvidence);

// Assign an issue to a technician (admin/manager only)
// Allow clients to request assignment for their own issues as well
router.post('/:id/assign', authenticate, authorizeRoles('admin', 'manager', 'client'), ctrl.assignToTech);
// Assign to internal property technician (allow property clients to request assignment)
router.post('/:id/assign-internal', authenticate, authorizeRoles('admin', 'manager', 'client'), ctrl.assignToInternal);
// Manager/admin approve or decline an issue
router.post('/:id/approve', authenticate, authorizeRoles('admin', 'manager'), ctrl.approveIssue);
router.post('/:id/decline', authenticate, authorizeRoles('admin', 'manager'), ctrl.declineIssue);
// Resubmit an issue to flag it for admin re-assignment (client/manager/admin)
router.post('/:id/resubmit', authenticate, authorizeRoles('client', 'manager', 'admin'), ctrl.resubmitIssue);

// Admin: all issues, Tech: assigned, User: own
// GET endpoints require authentication; allow public POST to create issues
router.get('/', authenticate, ctrl.getByRole);
router.get('/user/:userId', authenticate, authorizeRoles('client'), ctrl.getByUserId);
router.get('/assigned/:techId', authenticate, authorizeRoles('technician', 'internal'), ctrl.getByAssignedTech);
router.get('/:id', authenticate, ctrl.getById);
router.post('/', optionalAuthenticate, upload.single('photo'), ctrl.create);
router.put('/:id', authenticate, ctrl.update);
router.delete('/:id', authenticate, ctrl.delete);

module.exports = router;
