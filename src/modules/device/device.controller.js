const service = require('./device.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

exports.getAll = async (req, res) => {
  try {
    const items = await service.findAll();
    res.json(normalizeExtendedJSON(items));
  } catch (err) {
    console.error('[device.getAll]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const d = await service.findById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Not found' });
    res.json(normalizeExtendedJSON(d));
  } catch (err) {
    console.error('[device.getById]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const created = await service.create(req.body || {});
    res.status(201).json(normalizeExtendedJSON(created));
  } catch (err) {
    console.error('[device.create]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const updated = await service.update(req.params.id, req.body || {});
    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[device.update]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const result = await service.delete(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[device.delete]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.action = async (req, res) => {
  try {
    const { action } = req.params;
    const updated = await service.performAction(req.params.id, action);
    if (!updated) return res.status(404).json({ error: 'Device not found' });
    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[device.action]', err);
    res.status(500).json({ error: err.message });
  }
};
