
const express = require('express');
const ctrl = require('./issue.controller');
const upload = require('../../middleware/upload');
const { authenticate, authorizeRoles, optionalAuthenticate } = require('../../middleware/auth');
const { requireCompanyRecord } = require('../../middleware/companyOwnership');
const ownRecord = requireCompanyRecord('Issue');
const ownRecordOrPublic = requireCompanyRecord('Issue', { allowAnonymous: true });
const router = express.Router();

// Technician uploads BEFORE evidence (address, before image, fix time)
router.post('/:id/evidence/before', authenticate, ownRecord, authorizeRoles('technician'), ctrl.uploadBeforeEvidence);
// Technician uploads AFTER evidence (after image)
router.post('/:id/evidence/after', authenticate, ownRecord, authorizeRoles('technician'), ctrl.uploadAfterEvidence);

// Assign an issue to a technician (admin/manager only)
// Allow clients to request assignment for their own issues as well
router.post('/:id/assign', authenticate, ownRecord, authorizeRoles('admin', 'manager', 'client', 'technician', 'internal'), ctrl.assignToTech);
// Assign to internal property technician (allow property clients to request assignment)
router.post('/:id/assign-internal', authenticate, ownRecord, authorizeRoles('admin', 'manager', 'client'), ctrl.assignToInternal);
// Manager/admin/client can approve or decline a request.
// Controller enforces ownership for client/requestor roles.
router.post('/:id/approve', authenticate, ownRecord, authorizeRoles('admin', 'manager', 'client', 'requestor'), ctrl.approveIssue);
router.post('/:id/decline', authenticate, ownRecord, authorizeRoles('admin', 'manager', 'client', 'requestor'), ctrl.declineIssue);
// Resubmit an issue to flag it for admin re-assignment (client/manager/admin)
router.post('/:id/resubmit', authenticate, ownRecord, authorizeRoles('client', 'manager', 'admin'), ctrl.resubmitIssue);

// Admin: all issues, Tech: assigned, User: own
// GET endpoints require authentication; allow public POST to create issues
router.get('/', optionalAuthenticate, ctrl.getByRole);
router.get('/user/:userId', authenticate, authorizeRoles('client'), ctrl.getByUserId);
router.get('/assigned/:techId', authenticate, authorizeRoles('technician', 'internal'), ctrl.getByAssignedTech);
router.get('/:id/links', authenticate, ownRecord, ctrl.getLinks);
router.post('/:id/links', authenticate, ownRecord, ctrl.addLink);
router.delete('/:id/links/:linkId', authenticate, ownRecord, ctrl.removeLink);
router.get('/:id/files', authenticate, ownRecord, ctrl.getFiles);
router.post('/:id/files', authenticate, ownRecord, upload.array('files', 10), ctrl.addFiles);
router.get('/:id/activity', authenticate, ownRecord, ctrl.getActivity);
router.post('/:id/activity', authenticate, ownRecord, ctrl.addActivity);
router.get('/:id/costs', authenticate, ownRecord, ctrl.getCosts);
router.post('/:id/costs', authenticate, ownRecord, ctrl.addCost);
router.get('/:id/parts', authenticate, ownRecord, ctrl.getParts);
router.post('/:id/parts', authenticate, ownRecord, ctrl.addPart);
router.post('/:id/parts/reconcile', authenticate, ownRecord, ctrl.reconcileParts);
router.get('/:id/labor', authenticate, ownRecord, ctrl.getLabor);
router.post('/:id/labor', authenticate, ownRecord, ctrl.addLabor);
router.get('/:id/provider-portal', authenticate, ownRecord, ctrl.getProviderPortal);
router.put('/:id/provider-portal', authenticate, ownRecord, ctrl.updateProviderPortal);
router.get('/:id', optionalAuthenticate, ownRecordOrPublic, ctrl.getById);
// Accept one 'photo' and multiple 'file' attachments from public form
const issueUpload = upload.fields([
	{ name: 'photo', maxCount: 1 },
	{ name: 'photos', maxCount: 10 },
	{ name: 'file', maxCount: 5 },
	{ name: 'files', maxCount: 10 }
]);
router.post('/', optionalAuthenticate, issueUpload, ctrl.create);
router.put('/:id', authenticate, ownRecord, ctrl.update);
router.delete('/:id', authenticate, ownRecord, ctrl.delete);

module.exports = router;
