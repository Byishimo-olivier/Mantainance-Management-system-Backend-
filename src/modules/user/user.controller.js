const crypto = require('crypto');
const { createUser, findUserByEmail, getAllUsers, getUsersByRoles } = require('./user.service.js');
const UserInvite = require('./userInvite.model.js');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim().toLowerCase());

const resolveInviteRole = (inputRole, inputAccessLevel) => {
  const raw = String(inputRole || '').trim().toLowerCase();
  const requestedAccess = String(inputAccessLevel || '').trim().toLowerCase();

  // UI values (from Invite Users modal)
  if (raw === 'administrator') return { role: 'manager', accessLevel: 'full', label: 'Administrator' };
  if (raw === 'limited_administrator') return { role: 'manager', accessLevel: 'limited', label: 'Limited Administrator' };
  if (raw === 'technician') return { role: 'technician', accessLevel: 'full', label: 'Technician' };
  if (raw === 'limited_technician') return { role: 'technician', accessLevel: 'limited', label: 'Limited Technician' };

  // Legacy values
  if (raw === 'limited manager') return { role: 'manager', accessLevel: 'limited', label: 'Limited Administrator' };
  if (raw === 'limited technician') return { role: 'technician', accessLevel: 'limited', label: 'Limited Technician' };

  // Base roles
  const allowed = new Set(['admin', 'manager', 'technician', 'client', 'requestor', 'staff']);
  const role = allowed.has(raw) ? raw : 'technician';
  const accessLevel = requestedAccess === 'limited' ? 'limited' : 'full';
  const label = accessLevel === 'limited' ? `Limited ${role}` : role;
  return { role, accessLevel, label };
};

exports.registerUser = async (req, res) => {
  try {
    const user = await createUser(req.body);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const filter = req.user?.companyName ? { companyName: req.user.companyName } : {};
    const users = await getAllUsers(filter);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listClientsAndRequestors = async (req, res) => {
  try {
    const filter = req.user?.companyName ? { companyName: req.user.companyName } : {};
    const users = await getUsersByRoles(['client', 'requestor'], filter);
    res.json(users || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listInvites = async (req, res) => {
  try {
    const companyName = req.user?.companyName;
    if (!companyName) return res.status(400).json({ error: 'Missing companyName on user token' });
    const now = new Date();
    const invites = await UserInvite.find({
      companyName,
      used: false,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
    }).sort({ createdAt: -1 });
    res.json(invites || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteInvite = async (req, res) => {
  try {
    const companyName = req.user?.companyName;
    if (!companyName) return res.status(400).json({ error: 'Missing companyName on user token' });

    const id = String(req.params.id || '').trim();
    const { ObjectId } = require('mongodb');
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid invite id' });

    const result = await UserInvite.deleteOne({ _id: new ObjectId(id), companyName });
    if (!result || result.deletedCount === 0) return res.status(404).json({ error: 'Invite not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.inviteUser = async (req, res) => {
  try {
    const companyName = req.user?.companyName;
    const invitedByUserId = req.user?.userId;
    if (!companyName) return res.status(400).json({ error: 'Missing companyName on user token' });

    const email = normalizeEmail(req.body?.email);
    if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Valid email is required' });

    // If a user already exists, don't create another invite.
    const existingUser = await findUserByEmail(email);
    if (existingUser) return res.status(409).json({ error: 'User already exists with this email' });

    const { role, accessLevel, label } = resolveInviteRole(req.body?.role, req.body?.accessLevel);

    const defaultHours = parseInt(process.env.USER_INVITE_EXPIRES_HOURS, 10) || 168; // 7 days
    const requestedHours = Number(req.body?.expiresInHours);
    const expiresInHours = Number.isFinite(requestedHours) && requestedHours > 0 ? requestedHours : defaultHours;
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);

    const now = new Date();
    let invite = await UserInvite.findOne({
      email,
      companyName,
      used: false,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
    });

    if (!invite) {
      invite = await UserInvite.create({
        email,
        role,
        accessLevel,
        companyName,
        invitedByUserId,
        token: crypto.randomBytes(24).toString('hex'),
        expiresAt
      });
    } else {
      invite.role = role;
      invite.accessLevel = accessLevel;
      invite.invitedByUserId = invitedByUserId;
      invite.expiresAt = expiresAt;
      await invite.save();
    }

    // Send email invite (best-effort)
    try {
      const emailService = require('../emailService/email.service');
      await emailService.sendUserInvite({
        email,
        token: invite.token,
        roleLabel: label,
        companyName,
        expiresAt
      });
    } catch (emailErr) {
      console.error('[users.invite] failed to send email:', emailErr);
    }

    res.status(201).json(invite);
  } catch (err) {
    console.error('[users.invite] error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getInviteByToken = async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const invite = await UserInvite.findOne({ token });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.used) return res.status(410).json({ error: 'Invite already used' });
    if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) return res.status(410).json({ error: 'Invite expired' });

    res.json({
      email: invite.email,
      role: invite.role,
      accessLevel: invite.accessLevel,
      companyName: invite.companyName,
      expiresAt: invite.expiresAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.acceptInvite = async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const invite = await UserInvite.findOne({ token });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.used) return res.status(410).json({ error: 'Invite already used' });
    if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) return res.status(410).json({ error: 'Invite expired' });

    const email = invite.email;
    const existingUser = await findUserByEmail(email);
    if (existingUser) return res.status(409).json({ error: 'User already exists with this email' });

    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const password = String(req.body?.password || '');
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!phone) return res.status(400).json({ error: 'Phone is required' });
    if (!password) return res.status(400).json({ error: 'Password is required' });

    const createdUser = await createUser(
      {
        name,
        email,
        phone,
        password,
        role: invite.role,
        accessLevel: invite.accessLevel,
        companyName: invite.companyName,
        status: 'active'
      },
      { allowExistingCompany: true }
    );

    invite.used = true;
    invite.usedAt = new Date();
    await invite.save();

    res.status(201).json({ success: true, user: createdUser });
  } catch (err) {
    console.error('[users.acceptInvite] error:', err);
    res.status(500).json({ error: err.message });
  }
};

