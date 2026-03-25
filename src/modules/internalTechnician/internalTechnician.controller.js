const model = require('./internalTechnician.model');
const { normalizeExtendedJSON } = require('../../utils/normalize');

const getCompanyPropertyIds = async (companyName) => {
  if (!companyName) return [];
  try {
    const userService = require('../user/user.service');
    const propertyModel = require('../property/property.model');
    const users = await userService.getAllUsers({ companyName });
    const companyUserIds = users.map((u) => String(u.id || u._id || u.userId || '')).filter(Boolean);
    if (!companyUserIds.length) return [];
    const props = await propertyModel.findAll({
      OR: [
        { userId: { in: companyUserIds } },
        { clientId: { in: companyUserIds } },
        { requestorId: { in: companyUserIds } }
      ]
    });
    return props.map((p) => p.id || p._id).filter(Boolean);
  } catch (err) {
    console.error('[internalTechnician.controller] Failed to resolve company properties:', err);
    return [];
  }
};

module.exports = {
  async create(req, res) {
    try {
      const data = { ...req.body, type: 'INTERNAL' };
      // If a password is provided, create a linked User account for the technician
      if (data.password) {
        try {
          const userService = require('../user/user.service');
          const companyName = req.user?.companyName || data.companyName;
          if (!companyName) {
            return res.status(400).json({ error: 'Company name is required to create a linked user account' });
          }
          const userPayload = {
            name: data.name || 'Technician',
            email: data.email || undefined,
            phone: data.phone || undefined,
            password: data.password,
            role: 'TECH',
            companyName
          };
          // createUser will hash password and save to Mongo users collection
          await userService.createUser(userPayload, { allowExistingCompany: true });
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
      if (!data.companyName && req.user?.companyName) {
        data.companyName = req.user.companyName;
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
      const user = req.user;
      let techs;
      if (user && (user.role === 'admin' || user.role === 'manager' || user.role === 'client' || user.role === 'requestor')) {
        const propertyIds = user.companyName
          ? await getCompanyPropertyIds(user.companyName)
          : [];
        const resolvedPropertyIds = propertyIds.length ? propertyIds : (() => {
          return [];
        })();
        if (!resolvedPropertyIds.length) {
          const propertyModel = require('../property/property.model');
          const props = await propertyModel.findAll({
            OR: [
              { userId: user.userId },
              { clientId: user.userId },
              { requestorId: user.userId }
            ]
          });
          const ownPropertyIds = props.map(p => p.id || p._id).filter(Boolean);
          if (ownPropertyIds.length === 0) return res.json([]);
          techs = await model.findAll({ propertyId: { in: ownPropertyIds } });
        } else {
          techs = await model.findAll({ propertyId: { in: resolvedPropertyIds } });
        }
      } else {
        techs = await model.findAll();
      }
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
