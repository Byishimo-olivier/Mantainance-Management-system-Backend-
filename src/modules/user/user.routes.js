const express = require('express');
const {
  registerUser,
  listUsers,
  listClientsAndRequestors,
  inviteUser,
  getInviteByToken,
  acceptInvite,
  listInvites,
  deleteInvite,
} = require('./user.controller.js');
const { authenticate, authorizeRoles } = require('../../middleware/auth.js');

const router = express.Router();

router.post('/register', registerUser);
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

module.exports = router;
