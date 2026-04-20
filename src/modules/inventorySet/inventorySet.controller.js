const InventorySet = require('./inventorySet.model');

const isPrivilegedUser = (user) => ['admin', 'manager', 'superadmin'].includes(String(user?.role || '').toLowerCase());

const applyCompanyScope = async (req) => {
  const user = req.user;
  if (!user) return [];

  // ALWAYS filter by company, regardless of user role
  const companyName = String(user.companyName || '').trim().toLowerCase();
  if (!companyName) return [];

  return InventorySet.find({ companyName: new RegExp(`^${companyName}$`, 'i') }).sort({ createdAt: -1 });
};

const buildPayload = (data = {}, companyName = '') => ({
  name: String(data.name || '').trim(),
  description: String(data.description || '').trim(),
  location: String(data.location || '').trim(),
  status: String(data.status || 'ACTIVE').trim() || 'ACTIVE',
  tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
  partIds: Array.isArray(data.partIds) ? data.partIds.filter(Boolean) : [],
  notes: String(data.notes || '').trim(),
  companyName: String(data.companyName || companyName || '').trim(),
});

module.exports = {
  async list(req, res) {
    try {
      const items = await applyCompanyScope(req);
      res.json(items || []);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async create(req, res) {
    try {
      const payload = buildPayload(req.body || {}, req.user?.companyName || '');
      if (!payload.name) return res.status(400).json({ error: 'name is required' });
      const created = await InventorySet.create(payload);
      res.status(201).json(created);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const payload = buildPayload(req.body || {}, req.user?.companyName || '');
      if (!payload.name) return res.status(400).json({ error: 'name is required' });
      const updated = await InventorySet.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
      if (!updated) return res.status(404).json({ error: 'Not found' });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async remove(req, res) {
    try {
      const deleted = await InventorySet.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async getWithParts(req, res) {
    try {
      const set = await InventorySet.findById(req.params.id).populate('partIds');
      if (!set) return res.status(404).json({ error: 'Not found' });
      res.json(set);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async addPart(req, res) {
    try {
      const { partId } = req.body;
      if (!partId) return res.status(400).json({ error: 'partId is required' });
      
      const updated = await InventorySet.findByIdAndUpdate(
        req.params.id,
        { $addToSet: { partIds: partId } },
        { new: true, runValidators: true }
      ).populate('partIds');
      
      if (!updated) return res.status(404).json({ error: 'Not found' });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async removePart(req, res) {
    try {
      const { partId } = req.body;
      if (!partId) return res.status(400).json({ error: 'partId is required' });
      
      const updated = await InventorySet.findByIdAndUpdate(
        req.params.id,
        { $pull: { partIds: partId } },
        { new: true, runValidators: true }
      ).populate('partIds');
      
      if (!updated) return res.status(404).json({ error: 'Not found' });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async getParts(req, res) {
    try {
      const set = await InventorySet.findById(req.params.id).populate('partIds');
      if (!set) return res.status(404).json({ error: 'Not found' });
      res.json(set.partIds || []);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};
