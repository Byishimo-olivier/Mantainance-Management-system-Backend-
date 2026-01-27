const feedbackService = require('./feedback.service');

// GET /api/feedback/client/:userId
exports.getFeedbackForClient = async (req, res) => {
  try {
    const { userId } = req.params;
    const feedbacks = await feedbackService.getFeedbackForClient(userId);
    res.json(feedbacks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch feedback.' });
  }
};

// POST /api/feedback
exports.createFeedback = async (req, res) => {
  try {
    const feedback = await feedbackService.createFeedback(req.body);
    res.status(201).json(feedback);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create feedback.' });
  }
};

// GET /api/feedback/all (for managers)
exports.getAllFeedback = async (req, res) => {
  try {
    const feedbacks = await feedbackService.getAllFeedback();
    res.json(feedbacks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch all feedback.' });
  }
};
