const assetModel = require('./asset.model');
const { normalizeExtendedJSON } = require('../../utils/normalize');

module.exports = {
  async count(req, res) {
    try {
      const count = await assetModel.count();
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async create(req, res) {
    try {
      const data = { ...req.body };
      console.log('[Asset Create] req.user:', req.user);

      if (req.user && req.user.userId) {
        data.userId = String(req.user.userId);
      }

      const asset = await assetModel.create(data);
      res.status(201).json(normalizeExtendedJSON(asset));
    } catch (err) {
      console.error('[Asset Create] Prisma Error:', err.message);
      res.status(400).json({ error: err.message });
    }
  },
  async getAll(req, res) {
    try {
      // Build a simple filter from query params. Support ?propertyId=... (and alias ?property=...)
      const q = req.query || {};
      const filter = {};
      if (q.propertyId) filter.propertyId = q.propertyId;
      else if (q.property) filter.propertyId = q.property;
      const assets = await assetModel.findAll(filter);
      res.json(normalizeExtendedJSON(assets));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async getById(req, res) {
    try {
      const asset = await assetModel.findById(req.params.id);
      if (!asset) return res.status(404).json({ error: 'Not found' });
      res.json(normalizeExtendedJSON(asset));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async update(req, res) {
    try {
      const asset = await assetModel.update(req.params.id, req.body);
      res.json(normalizeExtendedJSON(asset));
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
  async move(req, res) {
    try {
      const assetId = req.params.id;
      const { from, to, movedBy, notes } = req.body || {};
      const entry = await assetModel.addMovement(assetId, { from, to, movedBy, notes });
      // Optionally update asset's location/gps if provided in 'to'
      try {
        const update = {};
        if (to) {
          if (to.location) update.location = to.location;
          if (to.gps) update.gps = to.gps;
        }
        if (Object.keys(update).length) await assetModel.update(assetId, update);
      } catch (uErr) {
        // ignore location update failures
      }
      res.status(201).json(normalizeExtendedJSON(entry));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
  async getMovements(req, res) {
    try {
      const assetId = req.params.id;
      const logs = await assetModel.getMovements(assetId);
      res.json(normalizeExtendedJSON(logs));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async addSparePart(req, res) {
    try {
      const data = { ...req.body };
      if (!data.assetId) data.assetId = req.params.id;
      const part = await assetModel.addSparePart(data);
      res.status(201).json(normalizeExtendedJSON(part));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
  async listSpareParts(req, res) {
    try {
      const assetId = req.params.id;
      const parts = await assetModel.findSparePartsForAsset(assetId);
      res.json(normalizeExtendedJSON(parts));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};