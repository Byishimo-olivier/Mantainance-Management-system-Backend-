const Part = require('./part.model');

const buildPartPayload = (data = {}, companyName = '') => ({
  name: data.name,
  partNumber: data.partNumber || '',
  category: data.category || '',
  tags: Array.isArray(data.tags) ? data.tags : [],
  description: data.description || '',
  status: data.status || 'STOCK_IN',
  available: Number(data.available || 0),
  allocated: Number(data.allocated || 0),
  onHand: Number(data.onHand || 0),
  incoming: Number(data.incoming || 0),
  location: data.location || '',
  barcode: data.barcode || '',
  nonStock: !!data.nonStock,
  critical: !!data.critical,
  minQtyThreshold: Number(data.minQtyThreshold || 0),
  maxQtyThreshold: Number(data.maxQtyThreshold || 0),
  assignedTo: Array.isArray(data.assignedTo) ? data.assignedTo : [],
  companyName: data.companyName || companyName,
  inventoryLines: Array.isArray(data.inventoryLines) ? data.inventoryLines.map((line) => ({
    location: line.location || '',
    area: line.area || '',
    minQty: Number(line.minQty || 0),
    maxQty: Number(line.maxQty || 0),
    availQty: Number(line.availQty || 0),
    cost: Number(line.cost || 0),
    barcode: line.barcode || ''
  })) : []
});

module.exports = {
  async list(req, res) {
    try {
      let items = await Part.find().sort({ createdAt: -1 });
      const user = req.user;
      // If no user, return empty array for security
      if (!user) {
        console.warn('[Parts.list] No authenticated user. Returning empty array.');
        return res.json([]);
      }
      // Check if user is admin/manager - they see all items
      const isAdmin = ['admin', 'manager', 'superadmin'].includes(user.role);
      if (!isAdmin) {
        // Regular users only see items matching their company
        if (!user.companyName) {
          console.warn('[Parts.list] Regular user has no companyName. Returning empty array.');
          return res.json([]);
        }
        const userCompanyName = String(user.companyName || '').toLowerCase().trim();
        items = items.filter((item) => {
          const itemCompany = String(item.companyName || item.company || '').toLowerCase().trim();
          return itemCompany === userCompanyName;
        });
      }
      res.json(items || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async create(req, res) {
    try {
      const data = req.body || {};
      if (!data.name) return res.status(400).json({ error: 'name is required' });
      const companyName = req.user?.companyName || '';
      const created = await Part.create(buildPartPayload(data, companyName));
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const item = await Part.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
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
          status: i.status || 'STOCK_IN',
          available: Number(i.available || 0),
          allocated: Number(i.allocated || 0),
          onHand: Number(i.onHand || 0),
          incoming: Number(i.incoming || 0),
          location: i.location || '',
          barcode: i.barcode || '',
          partNumber: i.partNumber || '',
          category: i.category || '',
          description: i.description || '',
          companyName: i.companyName || companyName
        }));
      const created = await Part.insertMany(docs);
      res.status(201).json(created || []);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const data = req.body || {};
      if (!data.name) return res.status(400).json({ error: 'name is required' });
      const companyName = req.user?.companyName || '';
      const updated = await Part.findByIdAndUpdate(req.params.id, buildPartPayload(data, companyName), { new: true, runValidators: true });
      if (!updated) return res.status(404).json({ error: 'Not found' });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async adjustQuantity(req, res) {
    try {
      const part = await Part.findById(req.params.id);
      if (!part) return res.status(404).json({ error: 'Not found' });

      const quantity = Number(req.body?.quantity || 0);
      const previousAvailable = Number(part.available || 0);
      const previousOnHand = Number(part.onHand || 0);
      const newAvailable = previousAvailable + quantity;
      const newOnHand = previousOnHand + quantity;

      part.available = newAvailable;
      part.onHand = newOnHand;
      part.adjustments = Array.isArray(part.adjustments) ? part.adjustments : [];
      part.adjustments.unshift({
        quantity,
        reason: req.body?.reason || '',
        previousAvailable,
        newAvailable,
        createdBy: req.body?.createdBy || '',
        createdAt: new Date()
      });

      await part.save();
      res.json(part);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const removed = await Part.findByIdAndDelete(req.params.id);
      if (!removed) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
};
