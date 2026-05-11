const mongoose = require('mongoose');

const PartRequestSchema = new mongoose.Schema(
  {
    partId: { type: String, required: true },
    partName: { type: String, required: true },
    partNumber: { type: String, default: '' },
    category: { type: String, default: '' },
    quantityRequested: { type: Number, required: true, default: 1 },
    requestedBy: { type: String, required: true },
    requestedFrom: { 
      type: String, 
      enum: ['WORK_ORDER', 'PM', 'MANUAL', 'OTHER'],
      default: 'MANUAL'
    },
    workOrderId: { type: String, default: '' },
    pmId: { type: String, default: '' },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED'],
      default: 'PENDING'
    },
    reason: { type: String, default: '' },
    notes: { type: String, default: '' },
    companyName: { type: String, required: true, index: true },
    
    // Approval tracking
    approvedBy: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    declinedBy: { type: String, default: '' },
    declinedAt: { type: Date, default: null },
    declineReason: { type: String, default: '' },
    
    // Allocation tracking
    allocations: {
      allocatedBy: { type: String, default: '' },
      allocatedAt: { type: Date, default: null },
      givenBy: { type: String, default: '' },
      givenAt: { type: Date, default: null },
      receivedBy: { type: String, default: '' },
      receivedAt: { type: Date, default: null },
      quantityAllocated: { type: Number, default: 0 },
      quantityGiven: { type: Number, default: 0 },
      quantityReceived: { type: Number, default: 0 }
    },
    
    // History of changes
    history: [{
      action: { type: String, default: '' }, // 'CREATED', 'APPROVED', 'REJECTED', 'ALLOCATED', 'GIVEN', 'RECEIVED', 'FULFILLED'
      actionBy: { type: String, default: '' },
      actionAt: { type: Date, default: Date.now },
      notes: { type: String, default: '' }
    }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('PartRequest', PartRequestSchema);
