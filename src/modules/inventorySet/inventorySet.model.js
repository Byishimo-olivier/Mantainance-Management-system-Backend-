const mongoose = require('mongoose');

const InventorySetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    location: { type: String, default: '' },
    status: { type: String, default: 'ACTIVE' },
    tags: [{ type: String }],
    partIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Part' }],
    companyName: { type: String, default: '', index: true },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('InventorySet', InventorySetSchema);
