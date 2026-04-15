const service = require('./technician.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

// Invite an external technician (admin only)
exports.invite = async (req, res) => {
  try {
    // Only admins may invite external technicians
    const inviter = req.user;
    if (!inviter || !['superadmin', 'admin', 'manager'].includes(inviter.role)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { email, name, phone, expiresInHours } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Get companyName from authenticated user
    const companyName = req.user?.companyName || req.user?.company || null;

    // Create technician record (status = Invited)
    const tech = await service.create({ 
      name: name || 'Invited Technician', 
      email, 
      phone, 
      status: 'Invited',
      companyName 
    });

    // Create invite token record in Prisma
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const token = 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
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
// Returns external technicians (from Prisma Technician model)
exports.getAll = async (req, res) => {
  try {
    const technicians = await service.getAll();
    const mapped = technicians.map(t => {
      const obj = t.toObject ? t.toObject() : t;
      const id = obj._id ? obj._id.toString() : obj.id;
      return {
        ...obj,
        _id: id,
        id: id,
        source: 'external',
        type: 'EXTERNAL'
      };
    });
    res.json(normalizeExtendedJSON(mapped));
  } catch (err) {
    console.error('[technician.getAll] error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  const technician = await service.getById(req.params.id);
  if (!technician) return res.status(404).json({ error: 'Not found' });
  res.json(normalizeExtendedJSON(technician));
};

exports.create = async (req, res) => {
  try {
    const data = req.body;
    // Get companyName from request body or from authenticated user's company
    const companyName = data.companyName || req.user?.companyName || req.user?.company || null;
    
    const payload = {
      ...data,
      companyName
    };
    
    const created = await service.create(payload);

    // Send invitation or welcome email
    try {
      const emailService = require('../emailService/email.service');
      if (data.password) {
        // Simple welcome email if password was set by manager
        await emailService.sendTechnicianWelcome({
          email: created.email,
          name: created.name,
          role: 'Technician'
        });
      } else {
        // Invite link if no password set (they need to set one)
        // In this case, we might need a token, but the user requested password field in UI
        // so password will likely be present.
      }
    } catch (emailErr) {
      console.error('Error sending technician creation email:', emailErr);
    }

    res.status(201).json(normalizeExtendedJSON(created));
  } catch (err) {
    console.error('[technician.create] error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  const updated = await service.update(req.params.id, req.body);
  res.json(normalizeExtendedJSON(updated));
};

exports.delete = async (req, res) => {
  await service.delete(req.params.id);
  res.status(204).end();
};

// Manager/admin: get minimal tech list for assignment (external only)
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
        specialty: t.specialization,
        type: 'EXTERNAL'
      };
    });
    res.json(normalizeExtendedJSON(mapped));
  } catch (err) {
    console.error('[technician.controller.js:getForAssignment]', err);
    res.status(500).json({ error: err.message });
  }
};
