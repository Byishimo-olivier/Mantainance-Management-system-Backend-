const propertyModel = require('./property.model');
const { normalizeExtendedJSON } = require('../../utils/normalize');

module.exports = {
  async create(req, res) {
    try {
      const data = { ...req.body };
      console.log('[Property Create] req.user:', req.user);
      console.log('[Property Create] initial data:', data);

      if (req.user && req.user.userId) {
        data.userId = req.user.userId;
      }

      // Fallback: if userId is still missing but clientId is present, use it
      if (!data.userId && data.clientId) {
        console.log('[Property Create] Falling back: using clientId for userId');
        data.userId = data.clientId;
      }

      if (!data.userId) {
        console.error('[Property Create] Error: userId is still missing!');
      }

      const property = await propertyModel.create(data);
      res.status(201).json(normalizeExtendedJSON(property));
    } catch (err) {
      console.error('[Property Create] Prisma Error:', err.message);
      res.status(400).json({ error: err.message });
    }
  },
  async getAll(req, res) {
    try {
      // Anonymous and admin/manager see all, others see only their own
      const user = req.user;
      let properties;
      if (!user || user.role === 'admin' || user.role === 'manager') {
        properties = await propertyModel.findAll();
      } else {
        properties = await propertyModel.findAll({ userId: user.userId });
      }
      res.json(normalizeExtendedJSON(properties));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async getById(req, res) {
    try {
      const property = await propertyModel.findById(req.params.id);
      if (!property) return res.status(404).json({ error: 'Not found' });
      res.json(normalizeExtendedJSON(property));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async update(req, res) {
    try {
      const property = await propertyModel.update(req.params.id, req.body);
      res.json(normalizeExtendedJSON(property));
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
  async uploadPhotos(req, res) {
    try {
      const propertyId = req.params.id;
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }
      const paths = req.files.map((f) => `/uploads/${f.filename}`);
      // fetch existing property to append
      const existing = await propertyModel.findById(propertyId);
      if (!existing) return res.status(404).json({ error: 'Property not found' });
      const existingPhotos = Array.isArray(existing.photos) ? existing.photos : [];
      const updated = await propertyModel.update(propertyId, { photos: [...existingPhotos, ...paths] });
      res.json({ success: true, photos: updated.photos });
    } catch (err) {
      console.error('Error uploading photos:', err);
      res.status(500).json({ error: err.message });
    }
  },
};