const feedbackService = require('./feedback.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

// GET /api/feedback/client/:userId
exports.getFeedbackForClient = async (req, res) => {
  try {
    const { userId } = req.params;
    const feedbacks = await feedbackService.getFeedbackForClient(userId);
    res.json(normalizeExtendedJSON(feedbacks));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch feedback.' });
  }
};

// POST /api/feedback
exports.createFeedback = async (req, res) => {
  try {
    const feedback = await feedbackService.createFeedback(req.body);
    res.status(201).json(normalizeExtendedJSON(feedback));
  } catch (err) {
    res.status(500).json({ error: 'Failed to create feedback.' });
  }
};

// GET /api/feedback/all (for managers)
exports.getAllFeedback = async (req, res) => {
  try {
    const feedbacks = await feedbackService.getAllFeedback();
    res.json(normalizeExtendedJSON(feedbacks));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch all feedback.' });
  }
};
