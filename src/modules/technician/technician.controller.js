const service = require('./technician.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

// Invite an external technician (admin only)
exports.invite = async (req, res) => {
  try {
    // Only admins may invite external technicians
    const inviter = req.user;
    if (!inviter || (inviter.role !== 'admin' && inviter.role !== 'manager')) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { email, name, phone, expiresInHours } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Create technician record (status = Invited)
    const tech = await service.create({ name: name || 'Invited Technician', email, phone, status: 'Invited' });

    // Create invite token record in Prisma
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const token = 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2,10);
    const expiresAt = expiresInHours ? new Date(Date.now() + Number(expiresInHours) * 3600 * 1000) : null;
    const invite = await prisma.technicianInvite.create({ data: { technicianId: tech.id, email, token, expiresAt } });

    // Send email using email service
    try {
      const emailService = require('../emailService/email.service');
      await emailService.sendTechnicianInvite({ token, email, name: tech.name, expiresAt }, tech);
    } catch (emailErr) {
      console.error('Error sending technician invite email:', emailErr);
    }

    res.status(201).json(normalizeExtendedJSON({ tech, invite }));
  } catch (err) {
    console.error('[technician.invite] error:', err);
    res.status(500).json({ error: err.message });
  }
};
// Returns users with role TECH from User table
exports.getAll = async (req, res) => {
  const technicians = await service.getAll();
  // Ensure we return a plain object and ID is a string
  const plainTechnicians = technicians.map(t => {
    const obj = t.toObject ? t.toObject() : t;
    const id = obj._id ? obj._id.toString() : obj.id;
    // Mark source: external (Prisma) vs user-backed (if service returns user docs)
    const source = obj.email && obj.specialization !== undefined ? 'external' : 'user';
    return {
      ...obj,
      _id: id,
      id: id,
      source
    };
  });
  res.json(normalizeExtendedJSON(plainTechnicians));
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
    const mapped = (all || []).map(t => {
      const id = t._id ? t._id.toString() : t.id;
      return {
        id,
        _id: id,
        name: t.name,
        phone: t.phone,
        email: t.email,
        specialty: t.specialty
      };
    });
    res.json(normalizeExtendedJSON(mapped));
  } catch (err) {
    console.error('[technician.controller.js:getForAssignment]', err);
    res.status(500).json({ error: err.message });
  }
};
