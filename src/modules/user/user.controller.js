const crypto = require('crypto');
const { createUser, findUserByEmail, getAllUsers, getUsersByRoles, findCompanyBySlug, slugifyCompanyName } = require('./user.service.js');
const emailService = require('../emailService/email.service.js');
const UserInvite = require('./userInvite.model.js');
const User = require('./user.model.js');
const { PrismaClient } = require('@prisma/client');

const propertyModel = require('../property/property.model');
const assetModel = require('../asset/asset.model');
const internalTechnicianModel = require('../internalTechnician/internalTechnician.model');
const checklistService = require('../checklist/checklist.service');
const prisma = new PrismaClient();

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim().toLowerCase());
const roleLabelMap = {
  superadmin: 'Super Admin',
  admin: 'Administrator',
  manager: 'Administrator',
  technician: 'Technician',
  client: 'View Only',
  requestor: 'Requester',
  staff: 'Staff',
};

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
  const baseLabel = roleLabelMap[role] || role;
  const label = accessLevel === 'limited' ? `Limited ${baseLabel}` : baseLabel;
  return { role, accessLevel, label };
};

exports.registerUser = async (req, res) => {
  try {
    const payload = { ...(req.body || {}) };

    if (req.files?.branchEvidenceOneFile?.[0]) {
      payload.branchEvidenceOne = `/uploads/${req.files.branchEvidenceOneFile[0].filename}`;
    }
    if (req.files?.branchEvidenceTwoFile?.[0]) {
      payload.branchEvidenceTwo = `/uploads/${req.files.branchEvidenceTwoFile[0].filename}`;
    }
    if (Array.isArray(req.files?.branchImages) && req.files.branchImages.length > 0) {
      payload.branchImages = req.files.branchImages.map((file) => `/uploads/${file.filename}`);
    }

    // Auto-activate user on signup (no payment required)
    const user = await createUser(payload, { requirePaymentBeforeActivation: false });
    let companyId = null;

    const normalizedCompanyName = String(user.companyName || '').trim();
    const normalizedCompanyType = String(user.companyType || 'main').trim().toLowerCase();

    if (normalizedCompanyName && String(user.role || '').toLowerCase() !== 'superadmin') {
      try {
        const companySubscriptionService = require('../subscription/company-subscription.service');
        const trialService = require('../subscription/trial.service');

        const company = await companySubscriptionService.ensureCompanyExists(normalizedCompanyName, String(user._id));
        companyId = company?.id ? String(company.id) : null;

        if (companyId && normalizedCompanyType !== 'branch') {
          const freshCompany = await prisma.company.findUnique({
            where: { id: companyId },
            select: {
              id: true,
              trialStartDate: true,
              trialEndDate: true,
              subscriptionStatus: true,
              trialExceeded: true,
            },
          });

          const needsTrialInitialization =
            freshCompany &&
            !freshCompany.trialStartDate &&
            !freshCompany.trialEndDate &&
            String(freshCompany.subscriptionStatus || 'inactive').toLowerCase() === 'inactive' &&
            freshCompany.trialExceeded !== true;

          if (needsTrialInitialization) {
            await trialService.initializeFreeTrial(companyId);
          }
        }
      } catch (trialError) {
        console.error('Failed to ensure company trial on signup:', trialError.message);
      }
    }
    
    // Send welcome email to new user
    if (user.email) {
      try {
        await emailService.sendAccountWelcomeEmail({
          to: user.email,
          name: user.name || user.companyName,
          email: user.email,
          companyName: user.companyName,
          role: user.role
        });
      } catch (err) {
        console.error('Failed to send welcome email:', err.message);
        // Don't fail the registration if email fails
      }
    }

    // Return success message
    res.status(201).json({
      message: 'Account created successfully! Your account is active and ready to use. Check your email for a welcome message.',
      email: user.email,
      status: 'account_created',
      user: {
        _id: user._id,
        id: String(user._id),
        name: user.name,
        email: user.email,
        companyName: user.companyName,
        companyId,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.activateAccount = async (req, res) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({ error: 'Activation token is required' });
    }

    // Find user with matching activation token and ensure it hasn't expired
    const user = await User.findOne({
      activationToken: token,
      activationTokenExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid or expired activation token. Please sign up again to receive a new activation link.' 
      });
    }

    // Return activation details for frontend to proceed with payment
    const SettingsModel = require('../settings/settings.model');
    let settings = { pricing: {} };
    try {
      settings = await SettingsModel.findOne({}) || { pricing: {} };
    } catch (e) {
      console.warn('Could not load settings for pricing');
    }

    const plan = user.plan || 'basic';
    const billingCycle = user.billingCycle || 'monthly';
    const planPrice = settings.pricing?.[plan]?.[billingCycle];

    res.status(200).json({
      message: 'Activation token verified. Ready to proceed with payment.',
      status: 'token_verified',
      userId: user._id,
      email: user.email,
      plan: plan,
      billingCycle: billingCycle,
      price: planPrice?.price || 'Contact Admin',
      currency: planPrice?.currency || 'USD',
      activationToken: token
    });
  } catch (err) {
    res.status(500).json({ error: 'Error verifying activation token: ' + err.message });
  }
};

exports.completeActivation = async (req, res) => {
  try {
    const { activationToken, userId } = req.body;

    if (!activationToken || !userId) {
      return res.status(400).json({ error: 'Activation token and user ID are required' });
    }

    // Find and activate the user
    const user = await User.findByIdAndUpdate(
      userId,
      {
        isActive: true,
        paymentPendingActivation: false,
        activationToken: null,
        activationTokenExpires: null
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({
      message: 'Account activated successfully! You can now log in.',
      status: 'activated',
      email: user.email
    });
  } catch (err) {
    res.status(500).json({ error: 'Error activating account: ' + err.message });
  }
};

/**
 * Resend activation email to an unactivated account
 * POST /api/users/resend-activation
 * Body: { email: string }
 */
exports.resendActivationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isActive) {
      return res.status(400).json({ error: 'This account is already activated' });
    }

    // Generate new activation token (24 hours validity)
    const activationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Update user with new token
    await User.findByIdAndUpdate(user._id, {
      activationToken,
      activationTokenExpires: tokenExpires
    });

    // Generate activation link
    const activationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/activate/${activationToken}`;

    // Send activation email
    await emailService.sendActivationEmail({
      to: user.email,
      userName: user.name || user.companyName,
      activationLink,
      plan: 'Basic', // Default plan
      price: '0', // Will be set during payment
      billingCycle: 'monthly'
    });

    res.status(200).json({
      message: 'Activation email has been resent successfully',
      email: user.email,
      status: 'email_sent'
    });
  } catch (err) {
    console.error('Error resending activation email:', err.message);
    res.status(500).json({ error: 'Error resending activation email: ' + err.message });
  }
};

/**
 * Admin endpoint to directly activate a user (for development/testing)
 * POST /api/users/admin/activate
 * Body: { email: string }
 * Auth: Requires superadmin or admin role
 */
exports.adminActivateUser = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ error: 'User not found with email: ' + email });
    }

    if (user.isActive) {
      return res.status(400).json({ error: 'This account is already activated' });
    }

    // Activate the user directly
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        isActive: true,
        paymentPendingActivation: false,
        activationToken: null,
        activationTokenExpires: null
      },
      { new: true }
    );

    res.status(200).json({
      message: 'User account activated successfully by admin',
      email: updatedUser.email,
      name: updatedUser.name,
      status: 'activated'
    });
  } catch (err) {
    console.error('Error activating user:', err.message);
    res.status(500).json({ error: 'Error activating user: ' + err.message });
  }
};

exports.getPublicRequestContext = async (req, res) => {
  try {
    const companySlug = String(req.params.companySlug || '').trim();
    if (!companySlug) {
      return res.status(400).json({ error: 'Company link is required' });
    }

    const companyRecord = await findCompanyBySlug(companySlug);
    if (!companyRecord) {
      return res.status(404).json({ error: 'Public request link not found' });
    }

    const companyUsers = Array.isArray(companyRecord.users) ? companyRecord.users : [];
    const companyUserIds = companyUsers.map((user) => String(user._id || user.id || '')).filter(Boolean);
    const companyName = companyRecord.companyName;

    const properties = companyUserIds.length
      ? await propertyModel.findAll({
          OR: [
            { userId: { in: companyUserIds } },
            { clientId: { in: companyUserIds } },
            { requestorId: { in: companyUserIds } },
          ]
        })
      : [];

    const propertyIds = properties.map((property) => String(property.id || property._id || '')).filter(Boolean);
    const assets = propertyIds.length
      ? await assetModel.findAll({ propertyId: { in: propertyIds } })
      : [];
    const internalTechnicians = propertyIds.length
      ? await internalTechnicianModel.findAll({ propertyId: { in: propertyIds } })
      : [];
    const checklistTemplates = await checklistService.findAll(companyName);

    const sanitizeProperty = (property) => ({
      id: property.id || property._id,
      name: property.name || property.title || '',
      address: property.address || property.location || '',
      location: property.location || property.address || '',
    });

    const sanitizeAsset = (asset) => ({
      id: asset.id || asset._id,
      name: asset.name || asset.assetName || asset.title || '',
      serialNumber: asset.serialNumber || '',
      propertyId: asset.propertyId || asset.property?.id || asset.property?._id || '',
      property: asset.property ? {
        id: asset.property.id || asset.property._id,
        name: asset.property.name || '',
      } : null,
      location: asset.location || null,
    });

    const sanitizeTechnician = (tech) => ({
      id: tech.id || tech._id,
      name: tech.name || '',
      email: tech.email || '',
      phone: tech.phone || '',
      propertyId: tech.propertyId || tech.property?.id || tech.property?._id || '',
      property: tech.property ? {
        id: tech.property.id || tech.property._id,
        name: tech.property.name || '',
      } : null,
    });

    const sanitizeChecklist = (tpl) => ({
      id: tpl.id || tpl._id,
      name: tpl.name || tpl.title || 'Checklist',
      title: tpl.title || tpl.name || 'Checklist',
      description: tpl.description || '',
      category: Array.isArray(tpl.tags) && tpl.tags.length ? tpl.tags[0] : 'Checklist',
      items: Array.isArray(tpl.items) ? tpl.items : (Array.isArray(tpl.checklist) ? tpl.checklist : []),
      updatedAt: tpl.updatedAt || tpl.createdAt || null,
    });

    return res.json({
      companyName,
      companySlug: slugifyCompanyName(companyName),
      publicRequestUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/public-request/${slugifyCompanyName(companyName)}`,
      properties: properties.map(sanitizeProperty),
      assets: assets.map(sanitizeAsset),
      internalTechnicians: internalTechnicians.map(sanitizeTechnician),
      checklistTemplates: checklistTemplates.map(sanitizeChecklist),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const filter = req.user?.role === 'superadmin' ? {} : (req.user?.companyName ? { companyName: req.user.companyName } : {});
    const users = await getAllUsers(filter);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listClientsAndRequestors = async (req, res) => {
  try {
    const filter = req.user?.role === 'superadmin' ? {} : (req.user?.companyName ? { companyName: req.user.companyName } : {});
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

    // Allow same email in different companies - only reject if in SAME company
    const existingUser = await findUserByEmail(email);
    if (existingUser && existingUser.companyName === companyName) {
      return res.status(409).json({ error: 'User already exists with this email in your company' });
    }

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

    const email = invite.email.toLowerCase().trim();
    const companyName = String(invite.companyName || '').trim();
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // Check if user already exists in this company (by email)
    const existingByEmail = await prisma.user.findFirst({
      where: { 
        email,
        companyName 
      }
    });
    
    if (existingByEmail) {
      return res.status(409).json({ error: 'User already exists with this email in your company' });
    }

    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const password = String(req.body?.password || '');
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!phone) return res.status(400).json({ error: 'Phone is required' });
    if (!password) return res.status(400).json({ error: 'Password is required' });

    // Check phone uniqueness in the same company
    const existingByPhone = await prisma.user.findFirst({
      where: { 
        phone: phone.trim(),
        companyName 
      }
    });
    
    if (existingByPhone) {
      return res.status(409).json({ error: 'This phone number is already registered in your company' });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user in Prisma
    const createdUser = await prisma.user.create({
      data: {
        name,
        email,
        phone: phone.trim(),
        password: hashedPassword,
        role: invite.role || 'technician',
        status: 'active',
        companyName: companyName,
        isCompanyAdmin: invite.role === 'manager' || invite.role === 'admin'
      }
    });

    // Mark invite as used
    invite.used = true;
    invite.usedAt = new Date();
    await invite.save();

    res.status(201).json({ success: true, user: createdUser });
  } catch (err) {
    console.error('[users.acceptInvite] error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorCompany = String(req.user?.companyName || '').trim();
    const existing = await User.findById(id);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    if (actorRole !== 'superadmin' && actorCompany && String(existing.companyName || '').trim() !== actorCompany) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updates = {};
    ['name', 'phone', 'role', 'status', 'companyName', 'accessLevel', 'branchName', 'branchDetails', 'companyType'].forEach((field) => {
      if (req.body?.[field] !== undefined) updates[field] = req.body[field];
    });
    if (req.body?.email !== undefined) updates.email = normalizeEmail(req.body.email);

    const updated = await User.findByIdAndUpdate(id, { $set: updates }, { new: true }).select('-password');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorCompany = String(req.user?.companyName || '').trim();
    const existing = await User.findById(id);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    if (actorRole !== 'superadmin' && actorCompany && String(existing.companyName || '').trim() !== actorCompany) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await User.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.manageCompany = async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim().toLowerCase();
    const companyName = String(req.body?.companyName || '').trim();
    const nextCompanyName = String(req.body?.nextCompanyName || '').trim();

    if (!companyName) return res.status(400).json({ error: 'companyName is required' });

    if (action === 'rename') {
      if (!nextCompanyName) return res.status(400).json({ error: 'nextCompanyName is required' });
      await User.updateMany({ companyName }, { $set: { companyName: nextCompanyName } });
      return res.json({ success: true, companyName: nextCompanyName });
    }

    if (action === 'suspend') {
      await User.updateMany({ companyName }, { $set: { status: 'inactive' } });
      return res.json({ success: true });
    }

    if (action === 'activate') {
      await User.updateMany({ companyName }, { $set: { status: 'active' } });
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Unsupported company action' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

