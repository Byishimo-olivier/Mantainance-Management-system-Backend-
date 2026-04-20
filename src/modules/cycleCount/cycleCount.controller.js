const CycleCount = require('./cycleCount.model');

const isPrivilegedUser = (user) => ['admin', 'manager', 'superadmin'].includes(String(user?.role || '').toLowerCase());

const applyCompanyScope = async (req) => {
  const user = req.user;
  if (!user) return [];

  // ALWAYS filter by company, regardless of user role
  const companyName = String(user.companyName || '').trim().toLowerCase();
  if (!companyName) return [];

  return CycleCount.find({ companyName: new RegExp(`^${companyName}$`, 'i') }).sort({ createdAt: -1 });
};

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildPayload = (data = {}, companyName = '') => ({
  name: String(data.name || '').trim(),
  description: String(data.description || '').trim(),
  location: String(data.location || '').trim(),
  status: String(data.status || 'SCHEDULED').trim() || 'SCHEDULED',
  frequency: String(data.frequency || 'MONTHLY').trim() || 'MONTHLY',
  scheduledDate: parseDate(data.scheduledDate),
  lastCountDate: parseDate(data.lastCountDate),
  assignedTo: String(data.assignedTo || '').trim(),
  tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
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
      const created = await CycleCount.create(payload);
      res.status(201).json(created);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const payload = buildPayload(req.body || {}, req.user?.companyName || '');
      if (!payload.name) return res.status(400).json({ error: 'name is required' });
      const updated = await CycleCount.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
      if (!updated) return res.status(404).json({ error: 'Not found' });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async remove(req, res) {
    try {
      const deleted = await CycleCount.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};
