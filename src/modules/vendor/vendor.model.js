const mongoose = require('mongoose');

const VendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    contactName: { type: String, default: '' },
    email: { type: String, default: '' },
    type: { type: String, default: 'vendor' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Vendor', VendorSchema);
