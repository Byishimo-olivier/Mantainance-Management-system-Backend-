const model = require('./internalTechnician.model');
const { normalizeExtendedJSON } = require('../../utils/normalize');

module.exports = {
  async create(req, res) {
    try {
      const tech = await model.create(req.body);
      res.status(201).json(normalizeExtendedJSON(tech));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
  async getAll(req, res) {
    try {
      const techs = await model.findAll();
      res.json(normalizeExtendedJSON(techs));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async getById(req, res) {
    try {
      const tech = await model.findById(req.params.id);
      if (!tech) return res.status(404).json({ error: 'Not found' });
      res.json(normalizeExtendedJSON(tech));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async update(req, res) {
    try {
      const tech = await model.update(req.params.id, req.body);
      res.json(normalizeExtendedJSON(tech));
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