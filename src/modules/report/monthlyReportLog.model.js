const mongoose = require('mongoose');

const monthlyReportLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  companyName: { type: String, required: true, trim: true },
  recipientEmail: { type: String, required: true, trim: true, lowercase: true },
  reportType: { type: String, trim: true, default: 'monthly', index: true },
  periodKey: { type: String, required: true, trim: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  scheduledFor: { type: Date, required: true },
  sentAt: { type: Date, default: Date.now }
});

monthlyReportLogSchema.index({ userId: 1, periodKey: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyReportLog', monthlyReportLogSchema);
