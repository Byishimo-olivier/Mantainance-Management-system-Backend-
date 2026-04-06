const Vendor = require('./vendor.model');

const normalizeType = (val, fallback) => {
  const v = String(val || fallback || 'vendor').toLowerCase();
  if (v.includes('client') || v.includes('customer')) return 'client';
  return 'vendor';
};

module.exports = {
  async listVendors(req, res) {
    try {
      let items = await Vendor.find({ type: 'vendor' }).sort({ createdAt: -1 });
      const user = req.user;
      // If no user, return empty array for security
      if (!user) {
        console.warn('[Vendors.listVendors] No authenticated user. Returning empty array.');
        return res.json([]);
      }
      // Check if user is admin/manager - they see all items
      const isAdmin = ['admin', 'manager', 'superadmin'].includes(user.role);
      if (!isAdmin) {
        // Regular users only see items matching their company
        if (!user.companyName) {
          console.warn('[Vendors.listVendors] Regular user has no companyName. Returning empty array.');
          return res.json([]);
        }
        const userCompanyName = String(user.companyName || '').toLowerCase().trim();
        items = items.filter((item) => {
          const itemCompany = String(item.companyName || '').toLowerCase().trim();
          return itemCompany === userCompanyName;
        });
      }
      res.json(items || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async listClients(req, res) {
    try {
      let items = await Vendor.find({ type: 'client' }).sort({ createdAt: -1 });
      const user = req.user;
      // If no user, return empty array for security
      if (!user) {
        console.warn('[Vendors.listClients] No authenticated user. Returning empty array.');
        return res.json([]);
      }
      // Check if user is admin/manager - they see all items
      const isAdmin = ['admin', 'manager', 'superadmin'].includes(user.role);
      if (!isAdmin) {
        // Regular users only see items matching their company
        if (!user.companyName) {
          console.warn('[Vendors.listClients] Regular user has no companyName. Returning empty array.');
          return res.json([]);
        }
        const userCompanyName = String(user.companyName || '').toLowerCase().trim();
        items = items.filter((item) => {
          const itemCompany = String(item.companyName || '').toLowerCase().trim();
          return itemCompany === userCompanyName;
        });
      }
      res.json(items || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async createVendor(req, res) {
    try {
      const data = req.body || {};
      if (!data.name) return res.status(400).json({ error: 'name is required' });
      const companyName = req.user?.companyName || '';
      const created = await Vendor.create({
        name: data.name,
        address: data.address || '',
        phone: data.phone || '',
        contactName: data.contactName || data.contact || '',
        email: data.email || '',
        type: 'vendor',
        companyName: data.companyName || companyName
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
      const companyName = req.user?.companyName || '';
      const created = await Vendor.create({
        name: data.name,
        address: data.address || '',
        phone: data.phone || '',
        contactName: data.contactName || data.contact || '',
        email: data.email || '',
        type: 'client',
        companyName: data.companyName || companyName
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
      const companyName = req.user?.companyName || '';
      const docs = items
        .filter(i => i && i.name)
        .map(i => ({
          name: i.name,
          address: i.address || '',
          phone: i.phone || '',
          contactName: i.contactName || i.contact || '',
          email: i.email || '',
          type: normalizeType(i.type, 'vendor'),
          companyName: i.companyName || companyName
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
