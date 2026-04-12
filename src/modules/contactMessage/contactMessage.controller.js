const contactMessageService = require('./contactMessage.service');
const User = require('../user/user.model');

exports.createContactMessage = async (req, res) => {
  try {
    const { sessionId, visitorName, visitorEmail, message } = req.body;

    if (!sessionId || !visitorName || !visitorEmail || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const contactMessage = await contactMessageService.createContactMessage({
      sessionId,
      visitorName,
      visitorEmail,
      message
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: contactMessage
    });
  } catch (error) {
    console.error('Error creating contact message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

exports.getConversations = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify user is superadmin
    const user = await User.findById(userId);
    if (!user || user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmins can view contact messages' });
    }

    const conversations = await contactMessageService.getConversationsForSuperadmin(userId);

    res.status(200).json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

exports.getConversationMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const messages = await contactMessageService.getConversationMessages(sessionId);

    res.status(200).json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

exports.addReply = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, image } = req.body;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get full user object
    const adminUser = await User.findById(userId);
    if (!adminUser || adminUser.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmins can reply to contact messages' });
    }

    const updatedConversation = await contactMessageService.addReplyToConversation(
      sessionId,
      message,
      adminUser,
      image || null
    );

    res.status(200).json({
      success: true,
      message: 'Reply sent successfully',
      data: updatedConversation
    });
  } catch (error) {
    console.error('Error adding reply:', error);
    res.status(500).json({ error: 'Failed to send reply' });
  }
};

exports.deleteConversation = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    await contactMessageService.deleteConversation(sessionId);

    res.status(200).json({
      success: true,
      message: 'Conversation deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
};

exports.closeConversation = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const conversation = await contactMessageService.closeConversation(sessionId);

    res.status(200).json({
      success: true,
      message: 'Conversation closed successfully',
      data: conversation
    });
  } catch (error) {
    console.error('Error closing conversation:', error);
    res.status(500).json({ error: 'Failed to close conversation' });
  }
};
