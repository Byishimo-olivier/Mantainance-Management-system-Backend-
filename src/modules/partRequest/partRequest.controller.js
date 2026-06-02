const PartRequest = require('./partRequest.model');
const Part = require('../part/part.model');
const { PurchaseOrder, generatePoNumber } = require('../purchaseOrder/purchaseOrder.model');
const mongoose = require('mongoose');

const normalizeCompanyName = (value = '') => String(value || '').toLowerCase().trim();
const escapeRegExp = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildPartRequestPayload = (data = {}, companyName = '') => ({
  partId: data.partId,
  partName: data.partName,
  partNumber: data.partNumber || '',
  category: data.category || '',
  quantityRequested: Number(data.quantityRequested || 1),
  requestedBy: data.requestedBy,
  requestedFrom: data.requestedFrom || 'MANUAL',
  workOrderId: data.workOrderId || '',
  pmId: data.pmId || '',
  reason: data.reason || '',
  notes: data.notes || '',
  companyName: normalizeCompanyName(data.companyName || companyName),
  status: data.status || 'PENDING'
});

const derivePartStatus = (part = {}) => {
  if (part.nonStock) return 'NON_STOCK';
  const available = Number(part.available || 0);
  const minQty = Number(part.minQtyThreshold || 0);
  if (available <= 0) return 'STOCK_OUT';
  if (minQty > 0 && available < minQty) return 'LOW_STOCK';
  return 'STOCK_IN';
};

const buildActor = (req) => req.user?.name || req.user?.email || 'Unknown';

const companyFilter = (companyName = '') => ({
  companyName: {
    $regex: `^${escapeRegExp(normalizeCompanyName(companyName))}$`,
    $options: 'i'
  }
});

const getLinkedWorkId = (partRequest) => partRequest.workOrderId || partRequest.pmId || '';

const allocateApprovedRequestFromStock = async (partRequest, part, actor) => {
  const quantityRequested = Number(partRequest.quantityRequested || 0);
  const previousAvailable = Number(part.available || 0);
  const previousOnHand = Number(part.onHand || previousAvailable);

  part.available = Math.max(0, previousAvailable - quantityRequested);
  part.onHand = Math.max(0, previousOnHand - quantityRequested);
  part.allocated = Number(part.allocated || 0) + quantityRequested;
  part.status = derivePartStatus(part);
  part.allocationHistory = Array.isArray(part.allocationHistory) ? part.allocationHistory : [];
  part.allocationHistory.unshift({
    allocatedBy: actor,
    requestedBy: partRequest.requestedBy || '',
    quantity: quantityRequested,
    reason: partRequest.reason || `Approved ${partRequest.requestedFrom || 'part'} request`,
    workOrderId: getLinkedWorkId(partRequest),
    notes: `Auto-allocated from approved part request ${partRequest._id}`,
    date: new Date()
  });

  await part.save();

  partRequest.stockDecision = 'ALLOCATED_FROM_STOCK';
  partRequest.set('allocations.allocatedBy', actor);
  partRequest.set('allocations.allocatedAt', new Date());
  partRequest.set('allocations.quantityAllocated', quantityRequested);
  partRequest.history.push({
    action: 'ALLOCATED',
    actionBy: actor,
    actionAt: new Date(),
    notes: `${quantityRequested} ${partRequest.partName} allocated from inventory.`
  });
};

const createPurchaseOrderForApprovedRequest = async (partRequest, actor, req) => {
  const quantityRequested = Number(partRequest.quantityRequested || 1);
  const validPartId = mongoose.Types.ObjectId.isValid(partRequest.partId) ? partRequest.partId : undefined;
  const po = await PurchaseOrder.create({
    title: `Purchase ${partRequest.partName}`,
    poNumber: generatePoNumber(),
    status: 'Draft',
    items: [{
      name: partRequest.partName,
      quantity: quantityRequested,
      partId: validPartId,
      notes: partRequest.reason || partRequest.notes || `Generated from part request ${partRequest._id}`
    }],
    currency: 'RWF',
    materialRequestId: String(partRequest._id),
    issueId: partRequest.workOrderId || '',
    workOrderId: partRequest.workOrderId || '',
    source: partRequest.requestedFrom === 'PM' ? 'PM_PART_REQUEST' : 'WORK_ORDER_PART_REQUEST',
    category: partRequest.category || '',
    requisitioner: partRequest.requestedBy || '',
    notes: `Auto-created because requested quantity was not available in stock.${partRequest.pmId ? ` PM: ${partRequest.pmId}.` : ''}`,
    companyName: partRequest.companyName,
    createdBy: {
      id: req.user?.userId || req.user?.id || '',
      role: req.user?.role || '',
      name: req.user?.name || actor,
      email: req.user?.email || ''
    }
  });

  partRequest.stockDecision = 'PURCHASE_ORDER_CREATED';
  partRequest.purchaseOrderId = String(po._id);
  partRequest.purchaseOrderNumber = po.poNumber || '';
  partRequest.history.push({
    action: 'PURCHASE_ORDER_CREATED',
    actionBy: actor,
    actionAt: new Date(),
    notes: `Purchase order ${po.poNumber} created because stock is unavailable or insufficient.`
  });

  return po;
};

module.exports = {
  async list(req, res) {
    try {
      const user = req.user;
      if (!user) {
        console.warn('[PartRequest.list] No authenticated user');
        return res.json([]);
      }
      
      if (!user.companyName) {
        console.warn('[PartRequest.list] User has no companyName');
        return res.json([]);
      }
      
      const userCompanyName = normalizeCompanyName(user.companyName);
      
      // Apply filters from query params
      const filter = {
        companyName: {
          $regex: `^${escapeRegExp(userCompanyName)}$`,
          $options: 'i'
        }
      };
      
      if (req.query.status) {
        filter.status = req.query.status;
      }
      
      if (req.query.requestedFrom) {
        filter.requestedFrom = req.query.requestedFrom;
      }
      
      if (req.query.workOrderId) {
        filter.workOrderId = req.query.workOrderId;
      }
      
      if (req.query.pmId) {
        filter.pmId = req.query.pmId;
      }
      
      const items = await PartRequest.find(filter).sort({ createdAt: -1 });
      res.json(items || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async create(req, res) {
    try {
      const data = req.body || {};
      
      // Validate required fields
      if (!data.partId) return res.status(400).json({ error: 'partId is required' });
      if (!data.partName) return res.status(400).json({ error: 'partName is required' });
      if (!data.requestedBy) return res.status(400).json({ error: 'requestedBy is required' });
      
      const companyName = req.user?.companyName || '';
      if (!companyName) {
        return res.status(400).json({ error: 'User has no company assigned' });
      }
      
      const payload = buildPartRequestPayload(data, companyName);
      if (mongoose.Types.ObjectId.isValid(payload.partId)) {
        const part = await Part.findOne({
          _id: payload.partId,
          ...companyFilter(companyName)
        }).lean();
        if (part) {
          payload.partName = payload.partName || part.name || part.partNumber || 'Part';
          payload.partNumber = payload.partNumber || part.partNumber || '';
          payload.category = payload.category || part.category || '';
        }
      }
      
      // Add initial history entry
      payload.history = [{
        action: 'CREATED',
        actionBy: req.user?.name || req.user?.email || 'Unknown',
        actionAt: new Date(),
        notes: `Part request created for ${payload.quantityRequested}x ${payload.partName}`
      }];
      
      const created = await PartRequest.create(payload);
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const item = await PartRequest.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const data = req.body || {};
      const partRequest = await PartRequest.findById(req.params.id);
      
      if (!partRequest) {
        return res.status(404).json({ error: 'Part request not found' });
      }
      
      // Update allowed fields
      if (data.notes) partRequest.notes = data.notes;
      if (data.reason) partRequest.reason = data.reason;
      
      const updated = await partRequest.save();
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async approve(req, res) {
    try {
      const partRequest = await PartRequest.findById(req.params.id);
      if (!partRequest) {
        return res.status(404).json({ error: 'Part request not found' });
      }
      
      if (partRequest.status !== 'PENDING') {
        return res.status(400).json({ error: `Cannot approve request with status: ${partRequest.status}` });
      }
      
      const approver = buildActor(req);
      
      partRequest.status = 'APPROVED';
      partRequest.approvedBy = approver;
      partRequest.approvedAt = new Date();
      partRequest.history = partRequest.history || [];
      
      partRequest.history.push({
        action: 'APPROVED',
        actionBy: approver,
        actionAt: new Date(),
        notes: 'Part request approved'
      });

      const quantityRequested = Number(partRequest.quantityRequested || 0);
      const part = mongoose.Types.ObjectId.isValid(partRequest.partId)
        ? await Part.findOne({
          _id: partRequest.partId,
          ...companyFilter(partRequest.companyName)
        })
        : null;

      let purchaseOrder = null;
      if (part && !part.nonStock && Number(part.available || 0) >= quantityRequested) {
        await allocateApprovedRequestFromStock(partRequest, part, approver);
      } else {
        purchaseOrder = await createPurchaseOrderForApprovedRequest(partRequest, approver, req);
      }
      
      const updated = await partRequest.save();
      res.json({
        partRequest: updated,
        purchaseOrder,
        action: updated.stockDecision
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async decline(req, res) {
    try {
      const partRequest = await PartRequest.findById(req.params.id);
      if (!partRequest) {
        return res.status(404).json({ error: 'Part request not found' });
      }
      
      if (partRequest.status !== 'PENDING') {
        return res.status(400).json({ error: `Cannot decline request with status: ${partRequest.status}` });
      }
      
      const decliner = req.user?.name || req.user?.email || 'Unknown';
      const declineReason = req.body?.declineReason || 'No reason provided';
      
      partRequest.status = 'REJECTED';
      partRequest.declinedBy = decliner;
      partRequest.declinedAt = new Date();
      partRequest.declineReason = declineReason;
      
      partRequest.history = partRequest.history || [];
      partRequest.history.push({
        action: 'REJECTED',
        actionBy: decliner,
        actionAt: new Date(),
        notes: `Request declined: ${declineReason}`
      });
      
      const updated = await partRequest.save();
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async recordAllocatedBy(req, res) {
    try {
      const partRequest = await PartRequest.findById(req.params.id);
      if (!partRequest) {
        return res.status(404).json({ error: 'Part request not found' });
      }
      
      if (partRequest.status !== 'APPROVED') {
        return res.status(400).json({ error: 'Request must be APPROVED to record allocation' });
      }
      
      const allocator = req.body?.allocatedBy || '';
      if (!allocator) {
        return res.status(400).json({ error: 'allocatedBy is required' });
      }
      
      partRequest.set('allocations.allocatedBy', allocator);
      partRequest.set('allocations.allocatedAt', new Date());
      
      partRequest.history = partRequest.history || [];
      partRequest.history.push({
        action: 'ALLOCATED',
        actionBy: req.user?.name || req.user?.email || 'Unknown',
        actionAt: new Date(),
        notes: `Part allocated by: ${allocator}`
      });
      
      const updated = await partRequest.save();
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async recordGivenBy(req, res) {
    try {
      const partRequest = await PartRequest.findById(req.params.id);
      if (!partRequest) {
        return res.status(404).json({ error: 'Part request not found' });
      }
      
      if (partRequest.status !== 'APPROVED') {
        return res.status(400).json({ error: 'Request must be APPROVED to record given status' });
      }
      
      const giver = buildActor(req);
      
      const quantityGiven = Number(req.body?.quantityGiven || 0);
      
      partRequest.set('allocations.givenBy', giver);
      partRequest.set('allocations.givenAt', new Date());
      partRequest.set('allocations.quantityGiven', quantityGiven);
      
      partRequest.history = partRequest.history || [];
      partRequest.history.push({
        action: 'GIVEN',
        actionBy: req.user?.name || req.user?.email || 'Unknown',
        actionAt: new Date(),
        notes: `Part given by ${giver}, quantity: ${quantityGiven}`
      });
      
      const updated = await partRequest.save();
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async recordReceivedBy(req, res) {
    try {
      const partRequest = await PartRequest.findById(req.params.id);
      if (!partRequest) {
        return res.status(404).json({ error: 'Part request not found' });
      }
      
      if (partRequest.status !== 'APPROVED') {
        return res.status(400).json({ error: 'Request must be APPROVED to record received status' });
      }
      
      const receiver = req.body?.receivedBy || '';
      if (!receiver) {
        return res.status(400).json({ error: 'receivedBy is required' });
      }
      
      const quantityReceived = Number(req.body?.quantityReceived || 0);
      
      partRequest.set('allocations.receivedBy', receiver);
      partRequest.set('allocations.receivedAt', new Date());
      partRequest.set('allocations.quantityReceived', quantityReceived);
      
      // If all allocation steps are complete, mark as FULFILLED
      const alloc = partRequest.allocations;
      if (alloc.allocatedBy && alloc.givenBy && alloc.receivedBy) {
        partRequest.status = 'FULFILLED';
      }
      
      partRequest.history = partRequest.history || [];
      partRequest.history.push({
        action: 'RECEIVED',
        actionBy: req.user?.name || req.user?.email || 'Unknown',
        actionAt: new Date(),
        notes: `Part received by ${receiver}, quantity: ${quantityReceived}`
      });
      
      const updated = await partRequest.save();
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async fulfill(req, res) {
    try {
      const partRequest = await PartRequest.findById(req.params.id);
      if (!partRequest) {
        return res.status(404).json({ error: 'Part request not found' });
      }
      
      if (partRequest.status === 'FULFILLED') {
        return res.status(400).json({ error: 'Request is already fulfilled' });
      }
      
      if (partRequest.status === 'REJECTED' || partRequest.status === 'CANCELLED') {
        return res.status(400).json({ error: `Cannot fulfill request with status: ${partRequest.status}` });
      }
      
      partRequest.status = 'FULFILLED';
      
      partRequest.history = partRequest.history || [];
      partRequest.history.push({
        action: 'FULFILLED',
        actionBy: req.user?.name || req.user?.email || 'Unknown',
        actionAt: new Date(),
        notes: 'Part request fulfilled'
      });
      
      const updated = await partRequest.save();
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async cancel(req, res) {
    try {
      const partRequest = await PartRequest.findById(req.params.id);
      if (!partRequest) {
        return res.status(404).json({ error: 'Part request not found' });
      }
      
      if (partRequest.status === 'FULFILLED' || partRequest.status === 'CANCELLED') {
        return res.status(400).json({ error: `Cannot cancel request with status: ${partRequest.status}` });
      }
      
      partRequest.status = 'CANCELLED';
      
      partRequest.history = partRequest.history || [];
      partRequest.history.push({
        action: 'CANCELLED',
        actionBy: req.user?.name || req.user?.email || 'Unknown',
        actionAt: new Date(),
        notes: 'Part request cancelled'
      });
      
      const updated = await partRequest.save();
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async delete(req, res) {
    try {
      const deleted = await PartRequest.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      res.json({ message: 'Deleted successfully' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
};
