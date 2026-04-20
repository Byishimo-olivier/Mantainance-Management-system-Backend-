const mongoose = require('mongoose');

const CycleCountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    location: { type: String, default: '' },
    status: { type: String, default: 'SCHEDULED' },
    frequency: { type: String, default: 'MONTHLY' },
    scheduledDate: { type: Date, default: null },
    lastCountDate: { type: Date, default: null },
    assignedTo: { type: String, default: '' },
    tags: [{ type: String }],
    companyName: { type: String, default: '', index: true },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CycleCount', CycleCountSchema);
