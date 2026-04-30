const mongoose = require('mongoose');

const demoRequestSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    companyName: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    jobTitle: {
      type: String,
      required: false,
      trim: true
    },
    industry: {
      type: String,
      required: false,
      trim: true
    },
    companySize: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-500', '500+'],
      required: false
    },
    maintenanceChallenge: {
      type: String,
      required: false
    },
    status: {
      type: String,
      enum: ['pending', 'scheduled', 'completed', 'cancelled'],
      default: 'pending'
    },
    notes: {
      type: String,
      required: false
    },
    scheduledDateTime: {
      type: Date,
      required: false
    },
    ipAddress: {
      type: String,
      required: false
    },
    userAgent: {
      type: String,
      required: false
    },
    emailDelivery: {
      requester: {
        success: { type: Boolean, default: false },
        to: { type: String, trim: true },
        messageId: { type: String, trim: true },
        accepted: [{ type: String }],
        rejected: [{ type: String }],
        response: { type: String },
        error: { type: String }
      },
      superadmin: {
        success: { type: Boolean, default: false },
        to: { type: String, trim: true },
        messageId: { type: String, trim: true },
        accepted: [{ type: String }],
        rejected: [{ type: String }],
        response: { type: String },
        error: { type: String }
      }
    }
  },
  {
    timestamps: true
  }
);

// Index for faster queries
demoRequestSchema.index({ email: 1 });
demoRequestSchema.index({ createdAt: -1 });
demoRequestSchema.index({ status: 1 });

module.exports = mongoose.model('DemoRequest', demoRequestSchema);
