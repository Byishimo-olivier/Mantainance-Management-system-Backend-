const Part = require('./part.model');

module.exports = {
  async list(req, res) {
    try {
      const items = await Part.find().sort({ createdAt: -1 });
      res.json(items || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async create(req, res) {
    try {
      const data = req.body || {};
      if (!data.name) return res.status(400).json({ error: 'name is required' });
      const created = await Part.create({
        name: data.name,
        status: data.status || 'STOCK_IN',
        available: Number(data.available || 0),
        allocated: Number(data.allocated || 0),
        onHand: Number(data.onHand || 0),
        incoming: Number(data.incoming || 0),
        location: data.location || '',
        barcode: data.barcode || ''
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
          status: i.status || 'STOCK_IN',
          available: Number(i.available || 0),
          allocated: Number(i.allocated || 0),
          onHand: Number(i.onHand || 0),
          incoming: Number(i.incoming || 0),
          location: i.location || '',
          barcode: i.barcode || ''
        }));
      const created = await Part.insertMany(docs);
      res.status(201).json(created || []);
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
