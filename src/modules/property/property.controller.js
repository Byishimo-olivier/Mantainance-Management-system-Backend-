const propertyModel = require('./property.model');

module.exports = {
  async create(req, res) {
    try {
      const property = await propertyModel.create(req.body);
      res.status(201).json(property);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
  async getAll(req, res) {
    try {
      const properties = await propertyModel.findAll();
      res.json(properties);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async getById(req, res) {
    try {
      const property = await propertyModel.findById(req.params.id);
      if (!property) return res.status(404).json({ error: 'Not found' });
      res.json(property);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async update(req, res) {
    try {
      const property = await propertyModel.update(req.params.id, req.body);
      res.json(property);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
  async remove(req, res) {
    try {
      await propertyModel.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};