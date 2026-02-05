const service = require('./technician.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

// Returns users with role TECH from User table
exports.getAll = async (req, res) => {
  const technicians = await service.getAll();
  res.json(normalizeExtendedJSON(technicians));
};

exports.getById = async (req, res) => {
  const technician = await service.getById(req.params.id);
  if (!technician) return res.status(404).json({ error: 'Not found' });
  res.json(normalizeExtendedJSON(technician));
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

// Manager/admin: get minimal tech list for assignment
exports.getForAssignment = async (req, res) => {
  try {
    const all = await service.getAll();
    const mapped = (all || []).map(t => ({ id: t.id || t._id, name: t.name, phone: t.phone, email: t.email, specialty: t.specialty }));
    res.json(normalizeExtendedJSON(mapped));
  } catch (err) {
    console.error('[technician.controller.js:getForAssignment]', err);
    res.status(500).json({ error: err.message });
  }
};
