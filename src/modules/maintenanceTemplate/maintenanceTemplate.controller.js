const model = require('./maintenanceTemplate.model');

module.exports = {
  async create(req, res) {
    try {
      const template = await model.create(req.body);
      res.status(201).json(template);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
  async getAll(req, res) {
    try {
      const templates = await model.findAll();
      res.json(templates);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async getById(req, res) {
    try {
      const template = await model.findById(req.params.id);
      if (!template) return res.status(404).json({ error: 'Not found' });
      res.json(template);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async update(req, res) {
    try {
      const template = await model.update(req.params.id, req.body);
      res.json(template);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
  async remove(req, res) {
    try {
      await model.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};