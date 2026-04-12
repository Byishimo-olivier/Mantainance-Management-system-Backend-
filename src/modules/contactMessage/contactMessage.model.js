const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  visitorName: { type: String, required: true },
  visitorEmail: { type: String, required: true },
  messages: [
    {
      type: { type: String, enum: ['visitor', 'admin'], required: true },
      text: { type: String, required: true },
      image: { type: String }, // base64 encoded image
      sendBy: { type: String }, // admin user ID if type is 'admin'
      senderName: { type: String },
      timestamp: { type: Date, default: Date.now }
    }
  ],
  companyId: { type: String }, // For company-level filtering (optional)
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Superadmin users assigned to this conversation
  status: { type: String, enum: ['open', 'closed', 'pending'], default: 'open' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
