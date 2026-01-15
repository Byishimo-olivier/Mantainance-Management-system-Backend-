const service = require('./technician.service');

// Returns users with role TECH from User table
exports.getAll = async (req, res) => {
  const technicians = await service.getAll();
  res.json(technicians);
};

exports.getById = async (req, res) => {
  const technician = await service.getById(req.params.id);
  if (!technician) return res.status(404).json({ error: 'Not found' });
  res.json(technician);
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
