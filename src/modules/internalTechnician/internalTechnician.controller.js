const model = require('./internalTechnician.model');
const { normalizeExtendedJSON } = require('../../utils/normalize');

module.exports = {
  async create(req, res) {
    try {
      const data = { ...req.body };
      // If a password is provided, create a linked User account for the technician
      if (data.password) {
        try {
          const userService = require('../user/user.service');
          const userPayload = {
            name: data.name || 'Technician',
            email: data.email || undefined,
            phone: data.phone || undefined,
            password: data.password,
            role: 'TECH'
          };
          // createUser will hash password and save to Mongo users collection
          await userService.createUser(userPayload);
        } catch (uerr) {
          // If user creation fails (duplicate email/phone), return a clear error
          return res.status(400).json({ error: `Failed to create linked user: ${uerr.message}` });
        }
        // remove password before saving internal technician record
        delete data.password;
      }
      if (req.user && req.user.userId) {
        data.userId = String(req.user.userId);
      }
      console.log('[InternalTech Create] req.user:', req.user);
      console.log('[InternalTech Create] data:', data);

      const tech = await model.create(data);
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
  async getByProperty(req, res) {
    try {
      const propertyId = req.params.propertyId;
      if (!propertyId) return res.status(400).json({ error: 'propertyId is required' });
      const techs = await model.findAll({ propertyId });
      res.json(normalizeExtendedJSON(techs));
    } catch (err) {
      console.error('[internalTechnician.controller:getByProperty]', err);
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