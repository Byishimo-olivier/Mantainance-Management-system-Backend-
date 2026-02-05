const express = require('express');
const emailService = require('./email.service');
const { authenticate, authorizeRoles } = require('../../middleware/auth');

const router = express.Router();

// Test email endpoint (admin only)
router.post('/test', authenticate, authorizeRoles('admin'), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const result = await emailService.testEmail(email);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// Test admin emails endpoint (admin only)
router.post('/test-admins', authenticate, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await emailService.testAdminEmails();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send admin test email' });
  }
});

module.exports = router;