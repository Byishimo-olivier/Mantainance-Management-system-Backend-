const service = require('./manager.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

exports.getAll = async (req, res) => {
  const managers = await service.getAll();
  res.json(normalizeExtendedJSON(managers));
};

exports.getById = async (req, res) => {
  const manager = await service.getById(req.params.id);
  if (!manager) return res.status(404).json({ error: 'Not found' });
  res.json(normalizeExtendedJSON(manager));
};

exports.create = async (req, res) => {
  const data = req.body;
  const created = await service.create(data);
  res.status(201).json(normalizeExtendedJSON(created));
};

exports.update = async (req, res) => {
  const updated = await service.update(req.params.id, req.body);
  res.json(normalizeExtendedJSON(updated));
};

exports.delete = async (req, res) => {
  await service.delete(req.params.id);
  res.status(204).end();
};

exports.dashboardSummary = async (req, res) => {
  const summary = await service.getDashboardSummary();
  res.json(normalizeExtendedJSON(summary));
};
