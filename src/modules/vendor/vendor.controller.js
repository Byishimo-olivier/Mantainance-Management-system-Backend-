const Vendor = require('./vendor.model');

const normalizeType = (val, fallback) => {
  const v = String(val || fallback || 'vendor').toLowerCase();
  if (v.includes('client') || v.includes('customer')) return 'client';
  return 'vendor';
};

module.exports = {
  async listVendors(req, res) {
    try {
      const items = await Vendor.find({ type: 'vendor' }).sort({ createdAt: -1 });
      res.json(items || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async listClients(req, res) {
    try {
      const items = await Vendor.find({ type: 'client' }).sort({ createdAt: -1 });
      res.json(items || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async createVendor(req, res) {
    try {
      const data = req.body || {};
      if (!data.name) return res.status(400).json({ error: 'name is required' });
      const created = await Vendor.create({
        name: data.name,
        address: data.address || '',
        phone: data.phone || '',
        contactName: data.contactName || data.contact || '',
        email: data.email || '',
        type: 'vendor'
      });
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async createClient(req, res) {
    try {
      const data = req.body || {};
      if (!data.name) return res.status(400).json({ error: 'name is required' });
      const created = await Vendor.create({
        name: data.name,
        address: data.address || '',
        phone: data.phone || '',
        contactName: data.contactName || data.contact || '',
        email: data.email || '',
        type: 'client'
      });
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async bulk(req, res) {
    try {
      const items = (req.body && req.body.items) || [];
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array is required' });
      }
      const docs = items
        .filter(i => i && i.name)
        .map(i => ({
          name: i.name,
          address: i.address || '',
          phone: i.phone || '',
          contactName: i.contactName || i.contact || '',
          email: i.email || '',
          type: normalizeType(i.type, 'vendor')
        }));
      const created = await Vendor.insertMany(docs);
      res.status(201).json(created || []);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const removed = await Vendor.findByIdAndDelete(req.params.id);
      if (!removed) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
};
