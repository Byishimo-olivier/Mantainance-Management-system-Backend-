
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
// Manager/admin/client can approve or decline a request.
// Controller enforces ownership for client/requestor roles.
router.post('/:id/approve', authenticate, authorizeRoles('admin', 'manager', 'client', 'requestor'), ctrl.approveIssue);
router.post('/:id/decline', authenticate, authorizeRoles('admin', 'manager', 'client', 'requestor'), ctrl.declineIssue);
// Resubmit an issue to flag it for admin re-assignment (client/manager/admin)
router.post('/:id/resubmit', authenticate, authorizeRoles('client', 'manager', 'admin'), ctrl.resubmitIssue);

// Admin: all issues, Tech: assigned, User: own
// GET endpoints require authentication; allow public POST to create issues
router.get('/', optionalAuthenticate, ctrl.getByRole);
router.get('/user/:userId', authenticate, authorizeRoles('client'), ctrl.getByUserId);
router.get('/assigned/:techId', authenticate, authorizeRoles('technician', 'internal'), ctrl.getByAssignedTech);
router.get('/:id/links', authenticate, ctrl.getLinks);
router.post('/:id/links', authenticate, ctrl.addLink);
router.delete('/:id/links/:linkId', authenticate, ctrl.removeLink);
router.get('/:id/files', authenticate, ctrl.getFiles);
router.post('/:id/files', authenticate, upload.array('files', 10), ctrl.addFiles);
router.get('/:id/activity', authenticate, ctrl.getActivity);
router.post('/:id/activity', authenticate, ctrl.addActivity);
router.get('/:id/costs', authenticate, ctrl.getCosts);
router.post('/:id/costs', authenticate, ctrl.addCost);
router.get('/:id/parts', authenticate, ctrl.getParts);
router.post('/:id/parts', authenticate, ctrl.addPart);
router.get('/:id/labor', authenticate, ctrl.getLabor);
router.post('/:id/labor', authenticate, ctrl.addLabor);
router.get('/:id/provider-portal', authenticate, ctrl.getProviderPortal);
router.put('/:id/provider-portal', authenticate, ctrl.updateProviderPortal);
router.get('/:id', optionalAuthenticate, ctrl.getById);
// Accept one 'photo' and multiple 'file' attachments from public form
const issueUpload = upload.fields([
	{ name: 'photo', maxCount: 1 },
	{ name: 'file', maxCount: 5 }
]);
router.post('/', optionalAuthenticate, issueUpload, ctrl.create);
router.put('/:id', authenticate, ctrl.update);
router.delete('/:id', authenticate, ctrl.delete);

module.exports = router;
