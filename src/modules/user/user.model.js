const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  firstName: { type: String },
  lastName: { type: String },
  phone: { type: String, required: true, unique: true },
  countryCode: { type: String },
  companyName: { type: String, required: true, trim: true },
  techniciansCount: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'manager', 'technician', 'client', 'requestor', 'staff'], required: true },
  accessLevel: { type: String, enum: ['full', 'limited'], default: 'full' },
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

// Company is used as a tenant filter, so index it (non-unique)
userSchema.index({ companyName: 1 });

module.exports = mongoose.model('User', userSchema);
