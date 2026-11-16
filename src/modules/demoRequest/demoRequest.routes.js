const express = require('express');
const demoRequestController = require('./demoRequest.controller');
const { authenticate, authorizeRoles } = require('../../middleware/auth');

const router = express.Router();

// Public endpoint: Create demo request (from landing page)
router.post('/api/demo-requests', demoRequestController.createDemoRequest);

// Protected endpoints: Require authentication
router.get('/api/demo-requests', authenticate, authorizeRoles('superadmin'), demoRequestController.getDemoRequests);
router.patch('/api/demo-requests/:id/status', authenticate, authorizeRoles('superadmin'), demoRequestController.updateDemoRequestStatus);

module.exports = router;
