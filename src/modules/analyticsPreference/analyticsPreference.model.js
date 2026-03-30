const mongoose = require('mongoose');

const customDashboardSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  basedOn: { type: String, required: true, trim: true, maxlength: 80 },
  widgets: { type: [String], default: [] },
  settings: {
    timezoneMode: { type: String, default: "tile" },
    runOnLoad: { type: Boolean, default: true },
    allowFullscreen: { type: Boolean, default: true },
    defaultFiltersView: { type: String, default: "expanded" },
    filtersLocation: { type: String, default: "top" },
  },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const analyticsPreferenceSchema = new mongoose.Schema({
  userId: { type: String, required: true, trim: true },
  companyName: { type: String, trim: true, default: '' },
  scope: { type: String, required: true, trim: true, default: 'client-dashboard' },
  pinnedDashboardIds: { type: [String], default: [] },
  customDashboards: { type: [customDashboardSchema], default: [] },
}, { timestamps: true });

analyticsPreferenceSchema.index({ userId: 1, scope: 1 }, { unique: true });

module.exports = mongoose.model('AnalyticsPreference', analyticsPreferenceSchema);
