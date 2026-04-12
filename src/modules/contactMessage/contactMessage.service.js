const ContactMessage = require('./contactMessage.model');
const User = require('../user/user.model');
const nodemailer = require('nodemailer');

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD
  }
});

exports.createContactMessage = async (data) => {
  try {
    const { sessionId, visitorName, visitorEmail, message, image } = data;

    // Check if conversation exists
    let contactMessage = await ContactMessage.findOne({ sessionId });

    if (!contactMessage) {
      // Find all superadmin users
      const superadmins = await User.find({ role: 'superadmin', status: 'active' });
      const superadminIds = superadmins.map(user => user._id);

      // Create new conversation
      contactMessage = new ContactMessage({
        sessionId,
        visitorName,
        visitorEmail,
        messages: [
          {
            type: 'visitor',
            text: message,
            image: image || null,
            senderName: visitorName,
            timestamp: new Date()
          }
        ],
        assignedTo: superadminIds,
        status: 'open'
      });
    } else {
      // Add message to existing conversation
      contactMessage.messages.push({
        type: 'visitor',
        text: message,
        image: image || null,
        senderName: visitorName,
        timestamp: new Date()
      });
      contactMessage.updatedAt = new Date();
    }

    await contactMessage.save();

    // Send email notification to all superadmins
    const superadmins = await User.find({ role: 'superadmin', status: 'active' });
    if (superadmins.length > 0) {
      await this.sendEmailNotificationToSuperadmins(
        superadmins,
        visitorName,
        visitorEmail,
        message,
        image
      );
    }

    return contactMessage;
  } catch (error) {
    console.error('Error creating contact message:', error);
    throw error;
  }
};

exports.getConversationsForSuperadmin = async (userId) => {
  try {
    // Get all conversations assigned to this superadmin
    const conversations = await ContactMessage.find({
      assignedTo: userId
    })
      .select('sessionId visitorName visitorEmail status createdAt updatedAt messages')
      .sort({ updatedAt: -1 })
      .lean();

    return conversations.map(conv => ({
      sessionId: conv.sessionId,
      visitorName: conv.visitorName,
      visitorEmail: conv.visitorEmail,
      status: conv.status,
      lastMessage: conv.messages[conv.messages.length - 1]?.text || '',
      lastMessageTime: conv.messages[conv.messages.length - 1]?.timestamp || conv.updatedAt,
      messageCount: conv.messages.length,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt
    }));
  } catch (error) {
    console.error('Error fetching conversations:', error);
    throw error;
  }
};

exports.getConversationMessages = async (sessionId) => {
  try {
    const contactMessage = await ContactMessage.findOne({ sessionId });
    if (!contactMessage) {
      throw new Error('Conversation not found');
    }
    // Return messages with all fields including senderName and image
    // For visitor messages without senderName, use the conversation's visitorName
    return contactMessage.messages.map(msg => ({
      type: msg.type,
      text: msg.text,
      image: msg.image || null,
      senderName: msg.senderName || (msg.type === 'visitor' ? contactMessage.visitorName : null),
      sendBy: msg.sendBy,
      timestamp: msg.timestamp
    }));
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    throw error;
  }
};

exports.addReplyToConversation = async (sessionId, replyText, adminUser, replyImage) => {
  try {
    const contactMessage = await ContactMessage.findOne({ sessionId });
    if (!contactMessage) {
      throw new Error('Conversation not found');
    }

    // Add admin reply
    contactMessage.messages.push({
      type: 'admin',
      text: replyText,
      image: replyImage || null,
      sendBy: adminUser._id,
      senderName: adminUser.name,
      timestamp: new Date()
    });
    contactMessage.updatedAt = new Date();
    await contactMessage.save();

    // Send reply email to visitor
    await this.sendReplyEmailToVisitor(
      contactMessage.visitorEmail,
      contactMessage.visitorName,
      replyText,
      adminUser.name,
      replyImage
    );

    return contactMessage;
  } catch (error) {
    console.error('Error adding reply:', error);
    throw error;
  }
};

exports.deleteConversation = async (sessionId) => {
  try {
    const result = await ContactMessage.findOneAndDelete({ sessionId });
    return result;
  } catch (error) {
    console.error('Error deleting conversation:', error);
    throw error;
  }
};

exports.closeConversation = async (sessionId) => {
  try {
    const contactMessage = await ContactMessage.findOneAndUpdate(
      { sessionId },
      { status: 'closed', updatedAt: new Date() },
      { new: true }
    );
    return contactMessage;
  } catch (error) {
    console.error('Error closing conversation:', error);
    throw error;
  }
};

exports.sendEmailNotificationToSuperadmins = async (superadmins, visitorName, visitorEmail, message, image) => {
  try {
    for (const admin of superadmins) {
      let imageHtml = '';
      if (image && image.startsWith('data:image')) {
        imageHtml = `<img src="${image}" alt="message-image" style="max-width: 300px; border-radius: 8px; margin: 10px 0;" />`;
      }

      const emailContent = `
        <h2>New Contact Message</h2>
        <p><strong>From:</strong> ${visitorName} (${visitorEmail})</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
        ${imageHtml}
        <hr>
        <p>Log in to the admin panel to reply.</p>
      `;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: admin.email,
        subject: `New Contact Message from ${visitorName}`,
        html: emailContent
      });
    }
  } catch (error) {
    console.error('Error sending email notification:', error);
  }
};

exports.sendReplyEmailToVisitor = async (visitorEmail, visitorName, replyText, adminName, replyImage) => {
  try {
    let imageHtml = '';
    if (replyImage && replyImage.startsWith('data:image')) {
      imageHtml = `<img src="${replyImage}" alt="reply-image" style="max-width: 300px; border-radius: 8px; margin: 10px 0;" />`;
    }

    const emailContent = `
      <h2>Response to Your Message</h2>
      <p>Hi ${visitorName},</p>
      <p>Thank you for contacting us. Here's a response from our support team:</p>
      <p><strong>${adminName} replied:</strong></p>
      <p>${replyText}</p>
      ${imageHtml}
      <hr>
      <p>If you have any further questions, please don't hesitate to reach out.</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: visitorEmail,
      subject: 'Response to Your Contact Message',
      html: emailContent
    });
  } catch (error) {
    console.error('Error sending reply email:', error);
  }
};
