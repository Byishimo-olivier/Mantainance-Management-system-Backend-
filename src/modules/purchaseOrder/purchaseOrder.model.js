const mongoose = require('mongoose');
const crypto = require('crypto');

const ItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1 },
    unitCost: { type: Number, default: 0 },
    partId: { type: mongoose.Schema.Types.ObjectId, ref: 'Part' },
    notes: { type: String, default: '' }
  },
  { _id: false }
);

const generatePoNumber = () => {
  const ts = new Date();
  const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}`;
  return `PO-${stamp}-${Math.floor(Math.random() * 90000 + 10000)}`;
};

const generatePublicToken = () => crypto.randomBytes(20).toString('hex');

const PurchaseOrderSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    companyName: { type: String, default: '', index: true },
    poNumber: { type: String, unique: true, trim: true, default: generatePoNumber },
    publicToken: { type: String, unique: true, trim: true, default: generatePublicToken, index: true },
    status: { type: String, default: 'Draft' }, // Draft, Submitted, Approved, Received
    items: { type: [ItemSchema], default: [] },
    totalCost: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    vendor: { type: String, default: '' }, // denormalized vendor name
    materialRequestId: { type: String, default: '', index: true },
    issueId: { type: String, default: '', index: true },
    workOrderId: { type: String, default: '', index: true },
    source: { type: String, default: '' },
    expectedDate: { type: Date },
    purchaseDate: { type: Date },
    shippingMethod: { type: String, default: '' },
    terms: { type: String, default: '' },
    fobShippingPoint: { type: String, default: '' },
    category: { type: String, default: '' },
    additionalDetails: { type: String, default: '' },
    requisitioner: { type: String, default: '' },
    billing: {
      companyName: { type: String, default: '' },
      address: { type: String, default: '' },
      phone: { type: String, default: '' },
      fax: { type: String, default: '' }
    },
    shipping: {
      name: { type: String, default: '' },
      address: { type: String, default: '' },
      phone: { type: String, default: '' }
    },
    notes: { type: String, default: '' },
    vendorResponse: { type: String, default: '' },
    vendorResponseAt: { type: Date },
    vendorResponseNote: { type: String, default: '' },
    createdBy: {
      id: { type: String },
      role: { type: String },
      name: { type: String },
      email: { type: String }
    }
  },
  { timestamps: true }
);

const computeTotal = (items = []) =>
  items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0);

// Keep totals & identifiers in sync even when caller omits them
PurchaseOrderSchema.pre('validate', function () {
  this.totalCost = computeTotal(this.items || []);
  if (!this.poNumber) this.poNumber = generatePoNumber();
  if (!this.publicToken) this.publicToken = generatePublicToken();
  if (!this.title) this.title = 'Purchase Order';
});

module.exports = {
  PurchaseOrder: mongoose.model('PurchaseOrder', PurchaseOrderSchema),
  computeTotal,
  generatePoNumber,
  generatePublicToken
};
