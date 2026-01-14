import express from 'express';
import { registerUser, listUsers } from './user.controller.js';
import { authenticate, authorizeRoles } from '../../middleware/auth.js';

const router = express.Router();

router.post('/register', registerUser);
// Only ADMIN can list all users
router.get('/', authenticate, authorizeRoles('ADMIN'), listUsers);

export default router;
