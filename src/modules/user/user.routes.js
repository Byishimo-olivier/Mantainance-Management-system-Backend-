const express = require('express');
const {
  registerUser,
  activateAccount,
  completeActivation,
  resendActivationEmail,
  adminActivateUser,
  getPublicRequestContext,
  listUsers,
  listClientsAndRequestors,
  inviteUser,
  getInviteByToken,
  acceptInvite,
  listInvites,
  deleteInvite,
  updateUser,
  deleteUser,
  manageCompany,
} = require('./user.controller.js');
const { authenticate, authorizeRoles } = require('../../middleware/auth.js');
const upload = require('../../middleware/upload.js');

const router = express.Router();

router.post('/register', upload.fields([
  { name: 'branchEvidenceOneFile', maxCount: 1 },
  { name: 'branchEvidenceTwoFile', maxCount: 1 },
  { name: 'branchImages', maxCount: 10 }
]), registerUser);

// Activation endpoints
router.get('/activate/:token', activateAccount);
router.post('/complete-activation', completeActivation);
router.post('/resend-activation', resendActivationEmail);
router.post('/admin/activate', authenticate, authorizeRoles('superadmin', 'admin'), adminActivateUser);

router.get('/public-request-link/:companySlug', getPublicRequestContext);
// List users in the same company (companyName is taken from the JWT)
router.get('/', authenticate, authorizeRoles('admin', 'manager', 'client'), listUsers);
router.get('/clients-requestors', authenticate, authorizeRoles('admin', 'manager', 'client'), listClientsAndRequestors);

// Invite + accept flow
router.post('/invite', authenticate, authorizeRoles('admin', 'manager', 'client'), inviteUser);
router.get('/invite/:token', getInviteByToken);
router.post('/accept-invite', acceptInvite);

// Manage invites
router.get('/invites', authenticate, authorizeRoles('admin', 'manager', 'client'), listInvites);
router.delete('/invites/:id', authenticate, authorizeRoles('admin', 'manager', 'client'), deleteInvite);
router.patch('/company/manage', authenticate, authorizeRoles('superadmin', 'admin', 'manager'), manageCompany);
router.patch('/:id', authenticate, authorizeRoles('superadmin', 'admin', 'manager'), updateUser);
router.delete('/:id', authenticate, authorizeRoles('superadmin', 'admin', 'manager'), deleteUser);

module.exports = router;
