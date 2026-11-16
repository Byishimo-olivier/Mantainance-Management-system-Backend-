const express = require('express');
const contactMessageController = require('./contactMessage.controller');
const { authenticate, authorizeRoles } = require('../../middleware/auth');

const router = express.Router();

// Public endpoint: Create contact message (from landing page)
router.post('/api/contact-messages', contactMessageController.createContactMessage);

// Protected endpoints: Require authentication
router.get('/api/contact-messages/conversations', authenticate, contactMessageController.getConversations);
router.get('/api/contact-messages/:sessionId', authenticate, authorizeRoles('superadmin'), contactMessageController.getConversationMessages);
router.post('/api/contact-messages/:sessionId/reply', authenticate, contactMessageController.addReply);
router.delete('/api/contact-messages/:sessionId', authenticate, authorizeRoles('superadmin'), contactMessageController.deleteConversation);
router.patch('/api/contact-messages/:sessionId/close', authenticate, authorizeRoles('superadmin'), contactMessageController.closeConversation);

module.exports = router;
