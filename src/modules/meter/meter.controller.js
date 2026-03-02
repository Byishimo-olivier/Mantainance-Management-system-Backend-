const service = require('./meter.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

exports.getAll = async (req, res) => {
  try {
    const meters = await service.findAll();
    res.json(normalizeExtendedJSON(meters));
  } catch (err) {
    console.error('[meter.getAll]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const m = await service.findById(req.params.id);
    if (!m) return res.status(404).json({ error: 'Not found' });
    res.json(normalizeExtendedJSON(m));
  } catch (err) {
    console.error('[meter.getById]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const payload = req.body || {};
    const created = await service.create(payload);
    res.status(201).json(normalizeExtendedJSON(created));
  } catch (err) {
    console.error('[meter.create]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const updated = await service.update(req.params.id, req.body || {});
    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[meter.update]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const result = await service.delete(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[meter.delete]', err);
    res.status(500).json({ error: err.message });
  }
};
