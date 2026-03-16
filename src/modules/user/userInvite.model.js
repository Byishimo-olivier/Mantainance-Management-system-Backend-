const mongoose = require('mongoose');

const userInviteSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, required: true, enum: ['admin', 'manager', 'technician', 'client', 'requestor', 'staff'] },
  accessLevel: { type: String, enum: ['full', 'limited'], default: 'full' },
  companyName: { type: String, required: true, trim: true },
  invitedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  token: { type: String, required: true, unique: true, index: true },
  used: { type: Boolean, default: false },
  usedAt: { type: Date },
  expiresAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

userInviteSchema.index({ companyName: 1, used: 1, expiresAt: 1 });

module.exports = mongoose.model('UserInvite', userInviteSchema, 'userInvites');

