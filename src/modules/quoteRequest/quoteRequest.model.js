const mongoose = require('mongoose');

const quoteRequestSchema = new mongoose.Schema({
  requesterName: { type: String, trim: true, default: '' },
  requesterEmail: { type: String, trim: true, lowercase: true, default: '' },
  companyName: { type: String, trim: true, default: '' },
  plan: { type: String, trim: true, default: 'premium' },
  message: { type: String, trim: true, default: '' },
  userId: { type: String, trim: true, default: '' },
  status: { type: String, trim: true, default: 'pending' },
}, { timestamps: true });

quoteRequestSchema.index({ companyName: 1, createdAt: -1 });

module.exports = mongoose.model('QuoteRequest', quoteRequestSchema);
