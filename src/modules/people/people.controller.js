const service = require('./people.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

exports.getAll = async (req, res) => {
  try {
    const items = await service.findAll();
    res.json(normalizeExtendedJSON(items));
  } catch (err) {
    console.error('[people.getAll]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const item = await service.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(normalizeExtendedJSON(item));
  } catch (err) {
    console.error('[people.getById]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const payload = req.body || {};
    const created = await service.create(payload);
    res.status(201).json(normalizeExtendedJSON(created));
  } catch (err) {
    console.error('[people.create]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const updated = await service.update(req.params.id, req.body || {});
    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[people.update]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const result = await service.delete(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[people.delete]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const items = await service.findAll();
    res.json(normalizeExtendedJSON(items));
  } catch (err) {
    console.error('[people.getAll]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const item = await service.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(normalizeExtendedJSON(item));
  } catch (err) {
    console.error('[people.getById]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const payload = req.body || {};
    const created = await service.create(payload);
    res.status(201).json(normalizeExtendedJSON(created));
  } catch (err) {
    console.error('[people.create]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const updated = await service.update(req.params.id, req.body || {});
    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[people.update]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const result = await service.delete(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[people.delete]', err);
    res.status(500).json({ error: err.message });
  }
};
