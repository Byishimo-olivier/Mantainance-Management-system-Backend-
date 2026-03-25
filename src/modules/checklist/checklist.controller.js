const service = require('./checklist.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

const isSuperAdmin = (req) => String(req.user?.role || '').trim().toLowerCase() === 'superadmin';

const resolveCompanyName = async (req) => {
  if (isSuperAdmin(req)) return null;
  const direct = req.user?.companyName || req.body?.companyName || null;
  if (direct) return String(direct).trim();

  const userId = req.user?.userId;
  if (!userId) return null;

  try {
    const userService = require('../user/user.service');
    const user = await userService.findUserById(userId);
    if (user?.companyName) return String(user.companyName).trim();
  } catch (err) {
    // ignore and return null below
  }

  return null;
};

exports.getAll = async (req, res) => {
  try {
    const companyName = await resolveCompanyName(req);
    const items = await service.findAll(companyName, {
      search: req.query?.search,
      tag: req.query?.tag,
    });
    res.json(normalizeExtendedJSON(items));
  } catch (err) {
    console.error('[checklist.getAll]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const companyName = await resolveCompanyName(req);
    const m = await service.findById(req.params.id, companyName);
    if (!m) return res.status(404).json({ error: 'Not found' });
    res.json(normalizeExtendedJSON(m));
  } catch (err) {
    console.error('[checklist.getById]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const companyName = await resolveCompanyName(req);
    if (!companyName && !isSuperAdmin(req)) {
      return res.status(400).json({ error: 'Missing companyName for checklist save' });
    }
    const payload = { ...(req.body || {}) };
    if (companyName) {
      payload.companyName = companyName;
    } else if (isSuperAdmin(req) && !payload.companyName) {
      payload.companyName = 'SYSTEM';
    }
    if (!payload.name && !payload.title) {
      return res.status(400).json({ error: 'Checklist name is required' });
    }
    if (!Array.isArray(payload.items) && !Array.isArray(payload.checklist)) {
      return res.status(400).json({ error: 'Checklist items are required' });
    }
    const created = await service.create(payload);
    res.status(201).json(normalizeExtendedJSON(created));
  } catch (err) {
    console.error('[checklist.create]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.bulkCreate = async (req, res) => {
  try {
    const companyName = await resolveCompanyName(req);
    if (!companyName && !isSuperAdmin(req)) {
      return res.status(400).json({ error: 'Missing companyName for checklist save' });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const created = await service.bulkCreate(items, companyName || 'SYSTEM');
    res.status(201).json(normalizeExtendedJSON(created));
  } catch (err) {
    console.error('[checklist.bulkCreate]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.importCsv = async (req, res) => {
  try {
    const companyName = await resolveCompanyName(req);
    if (!companyName && !isSuperAdmin(req)) {
      return res.status(400).json({ error: 'Missing companyName for checklist import' });
    }

    const csvText = String(req.body?.csvText || '').trim();
    if (!csvText) {
      return res.status(400).json({ error: 'csvText is required' });
    }

    const imported = await service.importCsv({
      csvText,
      name: req.body?.name || req.body?.title || req.body?.fileName || 'Imported Checklist',
      title: req.body?.title || req.body?.name || req.body?.fileName || 'Imported Checklist',
      description: req.body?.description || '',
      tags: req.body?.tags,
      companyName: companyName || req.body?.companyName || 'SYSTEM',
      saveToLibrary: req.body?.saveToLibrary !== false,
    });

    res.status(req.body?.saveToLibrary === false ? 200 : 201).json(normalizeExtendedJSON(imported));
  } catch (err) {
    console.error('[checklist.importCsv]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const companyName = await resolveCompanyName(req);
    if (!companyName && !isSuperAdmin(req)) {
      return res.status(400).json({ error: 'Missing companyName for checklist save' });
    }
    const payload = { ...(req.body || {}) };
    if (companyName) {
      payload.companyName = companyName;
    } else if (isSuperAdmin(req) && !payload.companyName) {
      payload.companyName = 'SYSTEM';
    }
    if (!payload.name && !payload.title) {
      return res.status(400).json({ error: 'Checklist name is required' });
    }
    const updated = await service.update(req.params.id, payload, companyName);
    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[checklist.update]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const companyName = await resolveCompanyName(req);
    if (!companyName && !isSuperAdmin(req)) {
      return res.status(400).json({ error: 'Missing companyName for checklist delete' });
    }
    const result = await service.delete(req.params.id, companyName);
    res.json(result);
  } catch (err) {
    console.error('[checklist.delete]', err);
    res.status(500).json({ error: err.message });
  }
};
