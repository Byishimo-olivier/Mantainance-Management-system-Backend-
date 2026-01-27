const assetModel = require('./asset.model');

module.exports = {
  async create(req, res) {
    try {
      const asset = await assetModel.create(req.body);
      res.status(201).json(asset);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
  async getAll(req, res) {
    try {
      const assets = await assetModel.findAll();
      res.json(assets);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async getById(req, res) {
    try {
      const asset = await assetModel.findById(req.params.id);
      if (!asset) return res.status(404).json({ error: 'Not found' });
      res.json(asset);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async update(req, res) {
    try {
      const asset = await assetModel.update(req.params.id, req.body);
      res.json(asset);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
  async remove(req, res) {
    try {
      await assetModel.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};