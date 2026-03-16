const mongoose = require('mongoose');

const PartSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    status: { type: String, default: 'STOCK_IN' },
    available: { type: Number, default: 0 },
    allocated: { type: Number, default: 0 },
    onHand: { type: Number, default: 0 },
    incoming: { type: Number, default: 0 },
    location: { type: String, default: '' },
    barcode: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Part', PartSchema);
