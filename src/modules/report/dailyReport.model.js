const mongoose = require('mongoose');

const dailyReportSettingsSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    // Report time in HH:MM format (24-hour)
    sendTime: {
      type: String,
      default: '07:00',
      match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, // Validate HH:MM format
    },
    // Timezone for scheduling
    timeZone: {
      type: String,
      default: 'Africa/Kigali',
    },
    // Report recipients configuration
    recipients: {
      admins: {
        type: Boolean,
        default: true,
      },
      technicians: {
        type: Boolean,
        default: true,
      },
      clients: {
        type: Boolean,
        default: true,
      },
    },
    // Report content configuration
    reportContent: {
      openIssues: {
        type: Boolean,
        default: true,
      },
      completedIssues: {
        type: Boolean,
        default: true,
      },
      maintenanceSchedule: {
        type: Boolean,
        default: true,
      },
      workOrders: {
        type: Boolean,
        default: true,
      },
      assets: {
        type: Boolean,
        default: true,
      },
      techniciansStatus: {
        type: Boolean,
        default: true,
      },
    },
    // Enable/disable daily reports
    enabled: {
      type: Boolean,
      default: true,
    },
    // Additional settings
    includeWeekendReports: {
      type: Boolean,
      default: false,
    },
    emailFormat: {
      type: String,
      enum: ['html', 'text'],
      default: 'html',
    },
    lastSentDate: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: String,
      trim: true,
      default: 'system',
    },
    updatedBy: {
      type: String,
      trim: true,
      default: 'system',
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
dailyReportSettingsSchema.index({ companyName: 1, enabled: 1 });
dailyReportSettingsSchema.index({ createdAt: 1 });

module.exports = mongoose.model('DailyReportSettings', dailyReportSettingsSchema);
