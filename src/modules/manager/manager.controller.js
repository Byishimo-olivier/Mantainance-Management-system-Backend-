const service = require('./manager.service');

exports.getAll = async (req, res) => {
  const managers = await service.getAll();
  res.json(managers);
};

exports.getById = async (req, res) => {
  const manager = await service.getById(req.params.id);
  if (!manager) return res.status(404).json({ error: 'Not found' });
  res.json(manager);
};

exports.create = async (req, res) => {
  const data = req.body;
  const created = await service.create(data);
  res.status(201).json(created);
};

exports.update = async (req, res) => {
  const updated = await service.update(req.params.id, req.body);
  res.json(updated);
};

exports.delete = async (req, res) => {
  await service.delete(req.params.id);
  res.status(204).end();
};

exports.dashboardSummary = async (req, res) => {
  const summary = await service.getDashboardSummary();
  res.json(summary);
};
