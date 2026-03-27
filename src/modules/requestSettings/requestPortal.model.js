const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  required: { type: Boolean, default: false },
}, { _id: false });

const customFieldSchema = new mongoose.Schema({
  type: { type: String, default: 'Text' },
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
}, { _id: false });

const requestPortalSchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true, index: true },
  name: { type: String, required: true, trim: true },
  customUrl: { type: String, default: '', trim: true },
  type: { type: String, enum: ['general', 'location', 'asset'], default: 'general' },
  selectedLocationId: { type: String, default: '' },
  selectedAssetId: { type: String, default: '' },
  options: {
    attachments: { type: optionSchema, default: () => ({ enabled: true, required: false }) },
    location: { type: optionSchema, default: () => ({ enabled: true, required: false }) },
    asset: { type: optionSchema, default: () => ({ enabled: true, required: false }) },
  },
  customFields: { type: [customFieldSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.models.RequestPortal || mongoose.model('RequestPortal', requestPortalSchema);
