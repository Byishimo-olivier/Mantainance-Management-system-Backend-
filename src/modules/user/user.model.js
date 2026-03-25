const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  firstName: { type: String },
  lastName: { type: String },
  phone: { type: String, required: true, unique: true },
  countryCode: { type: String },
  companyName: { type: String, required: true, trim: true },
  companyType: { type: String, enum: ['main', 'branch'], default: 'main' },
  branchName: { type: String, trim: true },
  branchDetails: { type: String, trim: true },
  branchLocation: { type: String, trim: true },
  branchLatitude: { type: Number },
  branchLongitude: { type: Number },
  branchEvidenceOne: { type: String, trim: true },
  branchEvidenceTwo: { type: String, trim: true },
  branchImages: [{ type: String }],
  techniciansCount: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['superadmin', 'admin', 'manager', 'technician', 'client', 'requestor', 'staff'], required: true },
  accessLevel: { type: String, enum: ['full', 'limited'], default: 'full' },
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date }
});

// Company is used as a tenant filter, so index it (non-unique)
userSchema.index({ companyName: 1 });

module.exports = mongoose.model('User', userSchema);
