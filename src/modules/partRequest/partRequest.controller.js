const PartRequest = require('./partRequest.model');
const Part = require('../part/part.model');

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
      
      const approver = req.user?.name || req.user?.email || 'Unknown';
      
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
      
      const updated = await partRequest.save();
      res.json(updated);
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
      
      const giver = req.body?.givenBy || '';
      if (!giver) {
        return res.status(400).json({ error: 'givenBy is required' });
      }
      
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
