const express = require('express');
const router = express.Router();
const feedbackController = require('./feedback.controller');
const { authenticate, authorizeRoles } = require('../../middleware/auth');

// Get feedback for a client
router.get('/client/:userId', authenticate, feedbackController.getFeedbackForClient);

// Create feedback (for technician to submit feedback)
router.post('/', feedbackController.createFeedback);

// Get all feedback (for managers)
router.get('/all', authenticate, authorizeRoles('superadmin'), feedbackController.getAllFeedback);

module.exports = router;
