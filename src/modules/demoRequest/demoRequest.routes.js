const express = require('express');
const demoRequestController = require('./demoRequest.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

// Public endpoint: Create demo request (from landing page)
router.post('/api/demo-requests', demoRequestController.createDemoRequest);

// Protected endpoints: Require authentication
router.get('/api/demo-requests', authenticate, demoRequestController.getDemoRequests);
router.patch('/api/demo-requests/:id/status', authenticate, demoRequestController.updateDemoRequestStatus);

module.exports = router;
