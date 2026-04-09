const mongoose = require('mongoose');

const PartSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    partNumber: { type: String, default: '' },
    category: { type: String, default: '' },
    companyName: { type: String, default: '', index: true },
    tags: [{ type: String }],
    description: { type: String, default: '' },
    status: { type: String, default: 'STOCK_IN' },
    available: { type: Number, default: 0 },
    allocated: { type: Number, default: 0 },
    onHand: { type: Number, default: 0 },
    incoming: { type: Number, default: 0 },
    location: { type: String, default: '' },
    barcode: { type: String, default: '' },
    nonStock: { type: Boolean, default: false },
    critical: { type: Boolean, default: false },
    minQtyThreshold: { type: Number, default: 0 },
    maxQtyThreshold: { type: Number, default: 0 },
    assignedTo: [{ type: String }],
    inventoryLines: [{
      location: { type: String, default: '' },
      area: { type: String, default: '' },
      minQty: { type: Number, default: 0 },
      maxQty: { type: Number, default: 0 },
      availQty: { type: Number, default: 0 },
      cost: { type: Number, default: 0 },
      barcode: { type: String, default: '' }
    }],
    adjustments: [{
      quantity: { type: Number, default: 0 },
      reason: { type: String, default: '' },
      previousAvailable: { type: Number, default: 0 },
      newAvailable: { type: Number, default: 0 },
      createdBy: { type: String, default: '' },
      createdAt: { type: Date, default: Date.now }
    }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Part', PartSchema);
