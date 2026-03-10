const express = require('express');
const { registerUser, listUsers, listClientsAndRequestors } = require('./user.controller.js');
const { authenticate, authorizeRoles } = require('../../middleware/auth.js');

const router = express.Router();

router.post('/register', registerUser);
// Only ADMIN can list all users
router.get('/', authenticate, authorizeRoles('admin'), listUsers);
router.get('/clients-requestors', authenticate, authorizeRoles('admin', 'manager'), listClientsAndRequestors);

module.exports = router;
