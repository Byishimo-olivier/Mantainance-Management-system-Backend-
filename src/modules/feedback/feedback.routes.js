const express = require('express');
const router = express.Router();
const feedbackController = require('./feedback.controller');

// Get feedback for a client
router.get('/client/:userId', feedbackController.getFeedbackForClient);

// Create feedback (for technician to submit feedback)
router.post('/', feedbackController.createFeedback);

// Get all feedback (for managers)
router.get('/all', feedbackController.getAllFeedback);

module.exports = router;
