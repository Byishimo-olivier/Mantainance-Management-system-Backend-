const express = require('express');
const ctrl = require('./manager.controller');
const { authenticate, authorizeRoles } = require('../../middleware/auth.js');
const router = express.Router();

// All manager routes require authentication
router.use(authenticate);

// Only managers and admins can access manager routes
router.use(authorizeRoles('manager', 'admin'));

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.delete);

// Dashboard summary endpoint
router.get('/dashboard/summary', ctrl.dashboardSummary);

module.exports = router;
