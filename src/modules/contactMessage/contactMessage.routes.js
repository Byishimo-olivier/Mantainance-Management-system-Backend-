const express = require('express');
const contactMessageController = require('./contactMessage.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

// Public endpoint: Create contact message (from landing page)
router.post('/api/contact-messages', contactMessageController.createContactMessage);

// Protected endpoints: Require authentication
router.get('/api/contact-messages/conversations', authenticate, contactMessageController.getConversations);
router.get('/api/contact-messages/:sessionId', authenticate, contactMessageController.getConversationMessages);
router.post('/api/contact-messages/:sessionId/reply', authenticate, contactMessageController.addReply);
router.delete('/api/contact-messages/:sessionId', authenticate, contactMessageController.deleteConversation);
router.patch('/api/contact-messages/:sessionId/close', authenticate, contactMessageController.closeConversation);

module.exports = router;
