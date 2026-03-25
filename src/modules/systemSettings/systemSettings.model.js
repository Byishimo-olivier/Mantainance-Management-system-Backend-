const mongoose = require('mongoose');

const pricingCycleSchema = new mongoose.Schema({
  weekly: { type: Number, default: 0 },
  monthly: { type: Number, default: 0 },
  yearly: { type: Number, default: 0 },
}, { _id: false });

const systemSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'global' },
  pricing: {
    basic: { type: pricingCycleSchema, default: () => ({ weekly: 9.99, monthly: 29.99, yearly: 299.99 }) },
    professional: { type: pricingCycleSchema, default: () => ({ weekly: 24.99, monthly: 79.99, yearly: 799.99 }) },
    enterprise: { type: pricingCycleSchema, default: () => ({ weekly: 49.99, monthly: 199.99, yearly: 1999.99 }) },
  },
  security: {
    auditLoggingEnabled: { type: Boolean, default: true },
    notifyOnFailedLogin: { type: Boolean, default: true },
    maxLoginAttempts: { type: Number, default: 5 },
    lockoutMinutes: { type: Number, default: 15 },
    sessionTimeoutHours: { type: Number, default: 24 },
    passwordMinLength: { type: Number, default: 8 },
    enforceMfa: { type: Boolean, default: false },
    allowPublicRegistration: { type: Boolean, default: true },
    allowedIpRanges: { type: [String], default: [] },
    blockedIpAddresses: { type: [String], default: [] },
    blockedAccountEmails: { type: [String], default: [] },
  },
  platform: {
    appName: { type: String, default: 'MMS' },
    supportEmail: { type: String, default: '' },
    maintenanceMode: { type: Boolean, default: false },
    subscriptionCurrency: { type: String, default: 'USD' },
  },
}, { timestamps: true });

module.exports = mongoose.models.SystemSettings || mongoose.model('SystemSettings', systemSettingsSchema);
