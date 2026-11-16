// Standard CRUD handlers for simple company-owned collections (files, people, ...).
// Every record is stamped with the creator's company; reads, updates and deletes
// are limited to that company. Superadmins can see and manage every company.
const { normalizeExtendedJSON } = require('./normalize');
const { isSuperAdmin, scopeCompanyFor } = require('./tenantScope');

const createCompanyScopedController = (service, label) => ({
  async getAll(req, res) {
    try {
      const items = await service.findAll(scopeCompanyFor(req.user));
      res.json(normalizeExtendedJSON(items));
    } catch (err) {
      console.error(`[${label}.getAll]`, err);
      res.status(500).json({ error: `Failed to load ${label}` });
    }
  },

  async getById(req, res) {
    try {
      const item = await service.findById(req.params.id, scopeCompanyFor(req.user));
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(normalizeExtendedJSON(item));
    } catch (err) {
      console.error(`[${label}.getById]`, err);
      res.status(500).json({ error: `Failed to load ${label}` });
    }
  },

  async create(req, res) {
    try {
      const payload = { ...(req.body || {}) };
      // Non-superadmins can only create records for their own company.
      payload.companyName = isSuperAdmin(req.user)
        ? String(payload.companyName || '').trim()
        : String(req.user?.companyName || '').trim();
      if (!payload.companyName && !isSuperAdmin(req.user)) {
        return res.status(400).json({ error: 'Your account is not linked to a company' });
      }
      payload.createdBy = String(req.user?.userId || '');
      const created = await service.create(payload);
      res.status(201).json(normalizeExtendedJSON(created));
    } catch (err) {
      console.error(`[${label}.create]`, err);
      res.status(500).json({ error: `Failed to create ${label}` });
    }
  },

  async update(req, res) {
    try {
      const changes = { ...(req.body || {}) };
      delete changes._id;
      delete changes.id;
      if (!isSuperAdmin(req.user)) delete changes.companyName; // cannot move records between companies
      const updated = await service.update(req.params.id, changes, scopeCompanyFor(req.user));
      if (!updated) return res.status(404).json({ error: 'Not found' });
      res.json(normalizeExtendedJSON(updated));
    } catch (err) {
      console.error(`[${label}.update]`, err);
      res.status(500).json({ error: `Failed to update ${label}` });
    }
  },

  async delete(req, res) {
    try {
      const result = await service.delete(req.params.id, scopeCompanyFor(req.user));
      if (!result?.success) return res.status(404).json({ error: 'Not found' });
      res.json(result);
    } catch (err) {
      console.error(`[${label}.delete]`, err);
      res.status(500).json({ error: `Failed to delete ${label}` });
    }
  },
});

module.exports = { createCompanyScopedController };
