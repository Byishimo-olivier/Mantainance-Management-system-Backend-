const express = require('express');
const { registerUser, listUsers } = require('./user.controller.js');
const { authenticate, authorizeRoles } = require('../../middleware/auth.js');

const router = express.Router();

router.post('/register', registerUser);
// Only ADMIN can list all users
router.get('/', authenticate, authorizeRoles('admin'), listUsers);

module.exports = router;
