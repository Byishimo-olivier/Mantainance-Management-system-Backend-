const upload = require('../../middleware/upload');
const emailService = require('../emailService/email.service');
const notificationService = require('../notification/notification.service');
const smsService = require('../sms/sms.service');

const { normalizeExtendedJSON } = require('../../utils/normalize');

function normalizeId(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (val.id) return String(val.id);
    if (val._id) return String(val._id);
    if (val.$oid) return String(val.$oid);
    if (val.$id) return String(val.$id);
    try {
      if (typeof val.toString === 'function') {
        const s = val.toString();
        if (s && s !== '[object Object]') return s;
      }
    } catch (e) {
      // ignore
    }
  }
  return null;
}

const appendSystemChatMessage = (chat, text, meta = {}) => {
  const next = Array.isArray(chat) ? [...chat] : [];
  const sender = meta.sender || 'System';
  const role = meta.role || 'system';
  if (next.some(msg => msg && typeof msg === 'object' &&
    String(msg.text || '').toLowerCase() === String(text).toLowerCase() &&
    String(msg.sender || '').toLowerCase() === String(sender).toLowerCase()
  )) {
    return next;
  }
  next.push({
    sender,
    text,
    timestamp: new Date().toISOString(),
    role
  });
  return next;
};

const getStatusLifecycleMessage = (status) => {
  const normalized = String(status || '').toUpperCase().replace(/_/g, ' ').trim();
  if (normalized === 'APPROVED') return 'Request approved.';
  if (normalized === 'DECLINED' || normalized === 'REJECTED') return 'Request declined.';
  if (normalized === 'IN PROGRESS') return 'Work started.';
  if (normalized === 'COMPLETED' || normalized === 'COMPLETE' || normalized === 'FINISHED') return 'Work completed.';
  return null;
};

const compactForSms = (value, max = 120) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
};

const formatIssueSmsContext = (issue) => {
  const title = compactForSms(issue?.title || 'Maintenance request', 70);
  const location = compactForSms(issue?.location || issue?.address || '', 45);
  return location ? `"${title}" at ${location}` : `"${title}"`;
};

const collectPhoneNumbers = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [values])
    .map((value) => {
      if (!value) return '';
      if (typeof value === 'string') return value;
      return value.phone || '';
    })
    .map((value) => String(value || '').trim())
    .filter(Boolean)
));

const sendSmsToPhones = async (phones, body, context = 'notification') => {
  const uniquePhones = collectPhoneNumbers(phones);
  if (!uniquePhones.length || !String(body || '').trim()) return;
  try {
    await smsService.sendBulkSms({
      recipients: uniquePhones,
      body,
    });
  } catch (error) {
    console.error(`Error sending ${context} SMS:`, error);
  }
};

const sendSmsToUser = async (user, body, context = 'notification') => {
  await sendSmsToPhones([user], body, context);
};

const sendSmsToUsers = async (users, body, context = 'notification') => {
  await sendSmsToPhones(users, body, context);
};

const sendSmsToCompanyRoles = async ({ companyName, roles = [], body, context = 'company notification' }) => {
  if (!companyName || !Array.isArray(roles) || !roles.length || !String(body || '').trim()) {
    return [];
  }
  try {
    const userService = require('../user/user.service');
    const recipients = await userService.getUsersByRoles(roles, {
      companyName,
      status: 'active',
    });
    await sendSmsToUsers(recipients, body, context);
    return recipients;
  } catch (error) {
    console.error(`Error loading ${context} SMS recipients:`, error);
    return [];
  }
};

const issueHasAssignment = (issue) => {
  if (!issue || typeof issue !== 'object') return false;
  if (issue.assignedTo && String(issue.assignedTo).trim()) return true;
  if (Array.isArray(issue.assignees)) {
    return issue.assignees.some((entry) => {
      if (!entry) return false;
      if (typeof entry === 'string') return !!String(entry).trim();
      return !!String(entry.id || entry._id || entry.userId || entry.name || '').trim();
    });
  }
  return false;
};

const getIssueRecordType = (issue) => {
  const normalizedStatus = String(issue?.status || '').toUpperCase();
  if (issue?.approved || normalizedStatus === 'APPROVED' || normalizedStatus.includes('PROGRESS') || normalizedStatus.includes('COMPLETE')) {
    return 'Work Order';
  }
  return 'Request';
};

const resolveActorName = async (user, fallback = 'System') => {
  if (!user) return fallback;
  const direct = user.name || user.username || user.email;
  if (direct) return direct;
  const userId = user.userId || user.id || user._id;
  if (!userId) return user.role || fallback;
  try {
    const userService = require('../user/user.service');
    const dbUser = await userService.findUserById(userId);
    return dbUser?.name || dbUser?.username || dbUser?.email || user.role || fallback;
  } catch (e) {
    return user.role || fallback;
  }
};

const buildChatMessageSignature = (msg = {}) => {
  return [
    String(msg?.sender || '').trim().toLowerCase(),
    String(msg?.text || msg?.message || '').trim().toLowerCase(),
    String(msg?.timestamp || msg?.createdAt || '').trim()
  ].join('|');
};

const extractNewChatMessages = (oldChat = [], newChat = []) => {
  const seen = new Set((Array.isArray(oldChat) ? oldChat : []).map(buildChatMessageSignature));
  return (Array.isArray(newChat) ? newChat : []).filter((msg) => !seen.has(buildChatMessageSignature(msg)));
};

const buildDashboardLinkForRole = (role, issueId) => {
  const normalizedRole = String(role || '').toLowerCase();
  if (normalizedRole === 'technician' || normalizedRole === 'internal') return '/technician-dashboard';
  if (normalizedRole === 'manager' || normalizedRole === 'admin') return `/manager-dashboard?tab=issues&id=${issueId}`;
  return `/client-dashboard?id=${issueId}`;
};

const extractMentionTokens = (text) => {
  const raw = String(text || '');
  if (!raw) return [];
  const tokens = raw.match(/@([a-zA-Z0-9._-]+)/g) || [];
  return Array.from(new Set(tokens.map((token) => token.slice(1).trim().toLowerCase()).filter(Boolean)));
};

const maybeMatchesMention = (user, tokens = [], text = '') => {
  if (!user || tokens.length === 0) return false;
  const lowerText = String(text || '').toLowerCase();
  const emailLocalPart = String(user.email || '').toLowerCase().split('@')[0];
  const compactName = String(user.name || '').toLowerCase().replace(/\s+/g, '');
  const exactCandidates = [
    user.email,
    user.name,
    emailLocalPart,
    compactName
  ].filter(Boolean).map((value) => String(value).trim().toLowerCase());

  const splitNameCandidates = String(user.name || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return tokens.some((token) => {
    if (exactCandidates.includes(token)) return true;
    if (splitNameCandidates.includes(token)) return true;
    return exactCandidates.some((candidate) => lowerText.includes(`@${candidate}`));
  });
};

const getCompanyScopedIssues = async (companyName) => {
  if (!companyName) return [];
  const normalizedCompany = String(companyName).trim().toLowerCase();
  const userService = require('../user/user.service');
  const propertyModel = require('../property/property.model');
  const companyUsers = await userService.getAllUsers({ companyName: String(companyName).trim() });
  const companyUserIds = companyUsers.map((u) => normalizeId(u?.id || u?._id || u?.userId)).filter(Boolean);
  const companyProperties = companyUserIds.length
    ? await propertyModel.findAll({
        OR: [
          { userId: { in: companyUserIds } },
          { clientId: { in: companyUserIds } },
          { requestorId: { in: companyUserIds } }
        ]
      })
    : [];
  const companyPropertyIds = new Set(companyProperties.map((p) => normalizeId(p?.id || p?._id)).filter(Boolean));
  const issues = await service.getAll(null);
  return issues.filter((issue) => {
    const issueCompany = String(issue?.companyName || '').trim().toLowerCase();
    const issuePropertyId = normalizeId(issue?.propertyId || issue?.property?.id || issue?.property?._id);
    const relatedUserIds = [
      issue?.userId,
      issue?.clientId,
      issue?.requestorId,
      issue?.inspectorId,
      issue?.reportedBy,
      issue?.requestedBy
    ].map(normalizeId).filter(Boolean);
    return (
      (issueCompany && issueCompany === normalizedCompany) ||
      (issuePropertyId && companyPropertyIds.has(issuePropertyId)) ||
      relatedUserIds.some((id) => companyUserIds.includes(id))
    );
  });
};

const notifyMentionedUsers = async ({ oldChat, newChat, actorUser, issue }) => {
  try {
    const newMessages = extractNewChatMessages(oldChat, newChat);
    if (!newMessages.length) return;

    const userService = require('../user/user.service');
    const actorUserId = actorUser?.userId || actorUser?.id || actorUser?._id || null;
    const companyName = issue?.companyName || actorUser?.companyName || null;
    const candidateUsers = companyName
      ? await userService.getAllUsers({ companyName: String(companyName).trim(), status: 'active' })
      : await userService.getAllUsers({ status: 'active' });

    for (const msg of newMessages) {
      const text = String(msg?.text || msg?.message || '').trim();
      if (!text) continue;
      const tokens = extractMentionTokens(text);
      if (!tokens.length) continue;

      const mentionedUsers = candidateUsers.filter((candidate) => {
        const candidateId = candidate?._id || candidate?.id;
        if (!candidateId) return false;
        if (actorUserId && String(candidateId) === String(actorUserId)) return false;
        return maybeMatchesMention(candidate, tokens, text);
      });

      const uniqueUsers = mentionedUsers.filter((candidate, index, arr) =>
        index === arr.findIndex((other) => String(other?._id || other?.id) === String(candidate?._id || candidate?.id))
      );

      for (const candidate of uniqueUsers) {
        await notificationService.createNotification({
          userId: String(candidate._id || candidate.id),
          title: 'You were mentioned',
          message: `${msg?.sender || 'Someone'} mentioned you in "${issue?.title || 'a work order'}".`,
          type: 'mention',
          link: buildDashboardLinkForRole(candidate.role, issue?.id || issue?._id)
        });
      }
    }
  } catch (err) {
    console.error('Error creating mention notifications:', err);
  }
};

function normalizeDateInput(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === 'object' && value.$date) {
    value = value.$date;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? `${trimmed}T00:00:00.000Z`
      : trimmed;
    const parsed = new Date(iso);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

function buildAssigneePayload(entry = {}, fallbackRole = '') {
  if (!entry) return null;
  const id = entry.id || entry._id || entry.userId || null;
  const name = entry.name || entry.fullName || entry.username || entry.email || null;
  const email = entry.email || '';
  const phone = entry.phone || null;
  const role = entry.role || fallbackRole || '';
  if (!id && !name && !email) return null;
  return {
    id,
    name: name || email || String(id || ''),
    email,
    phone,
    role
  };
}

function issueLooksPreventive(issue = {}) {
  const tagsLower = (Array.isArray(issue.tags) ? issue.tags : []).map((tag) => {
    if (!tag) return '';
    if (typeof tag === 'string') return String(tag).toLowerCase();
    if (typeof tag === 'object' && tag.label) return String(tag.label).toLowerCase();
    return String(tag).toLowerCase();
  });
  const issueType = String(issue.issueType || issue.type || issue.category || '').toLowerCase();
  const looksPreventiveWord = (value) => String(value || '').toLowerCase().includes('prevent');
  const fingerprint = [
    issue.title,
    issue.description,
    issue.issueType,
    issue.type,
    issue.category,
    issue.submissionType,
    issue.preventiveMaintenanceName,
    issue.scheduleName,
    issue.pmName,
    ...tagsLower,
  ].filter(Boolean).join(' ').toLowerCase();

  return (
    Boolean(issue.isPreventive) ||
    tagsLower.some((tag) => looksPreventiveWord(tag)) ||
    looksPreventiveWord(issueType) ||
    looksPreventiveWord(fingerprint)
  );
}

async function ensurePreventiveScheduleForApprovedIssue(issue = {}, actor = null) {
  if (!issueLooksPreventive(issue)) return null;

  const issueId = String(issue.id || issue._id || '').trim();
  if (!issueId) return null;

  try {
    const mongoose = require('mongoose');
    const maintenanceScheduleModel = require('../maintenanceSchedule/maintenanceSchedule.model');
    const db = mongoose.connection?.db;
    if (!db) return null;

    const objectIdCandidates = [issueId];
    if (/^[a-f\d]{24}$/i.test(issueId)) {
      try {
        objectIdCandidates.push(new mongoose.Types.ObjectId(issueId));
      } catch (err) {
        // Ignore cast failures and keep the string candidate.
      }
    }

    const existingSchedule = await db.collection('MaintenanceSchedule').findOne({
      $or: [
        { sourceIssueId: { $in: objectIdCandidates } },
        { requestIssueId: { $in: objectIdCandidates } },
      ],
    });
    if (existingSchedule) return existingSchedule;

    const dueDate = normalizeDateInput(issue.fixDeadline)
      || normalizeDateInput(issue.nextDate)
      || normalizeDateInput(issue.dueDate)
      || normalizeDateInput(issue.createdAt)
      || new Date();

    const yyyy = dueDate.getFullYear();
    const mm = String(dueDate.getMonth() + 1).padStart(2, '0');
    const dd = String(dueDate.getDate()).padStart(2, '0');
    const hh = String(dueDate.getHours()).padStart(2, '0');
    const min = String(dueDate.getMinutes()).padStart(2, '0');

    const createdSchedule = await maintenanceScheduleModel.create({
      name: issue.title || issue.name || 'Preventive Maintenance Request',
      description: issue.description || 'Generated from an approved preventive request.',
      workOrderTitle: issue.title || issue.name || 'Preventive Maintenance Request',
      workOrderDescription: issue.description || 'Generated from an approved preventive request.',
      category: issue.category || issue.issueType || 'preventive',
      priority: issue.priority || 'MEDIUM',
      status: 'Pending',
      date: `${yyyy}-${mm}-${dd}`,
      time: `${hh}:${min}`,
      nextDate: dueDate,
      location: issue.location || issue.address || '',
      propertyId: issue.propertyId || null,
      assetId: issue.assetId || null,
      assetName: issue.assetName || '',
      assignedTo: issue.assignedTo || '',
      assignees: Array.isArray(issue.assignees) ? issue.assignees : [],
      team: issue.team || '',
      checklist: Array.isArray(issue.checklist) ? issue.checklist : [],
      estimatedTime: issue.estimatedTime || '',
      signature: Boolean(issue.signature),
      sourceIssueId: issueId,
      requestIssueId: issueId,
      source: 'approved-request',
      createFirstWorkOrder: false,
      tasks: [],
      tags: ['preventive', 'request'],
      assetsRows: [{
        id: `issue-${issueId}`,
        assetId: issue.assetId || '',
        locationId: issue.propertyId || '',
        startDate: `${yyyy}-${mm}-${dd}`,
        endDate: '',
        timezone: '(UTC+02:00) Africa/Kigali',
        assignee: issue.assignedTo || '',
      }],
      company: issue.companyName || actor?.companyName || null,
      companyName: issue.companyName || actor?.companyName || null,
      userId: issue.userId || actor?.userId || null,
    });

    return createdSchedule;
  } catch (err) {
    console.error('[issue.controller] Failed to create PM schedule from approved issue:', err);
    return null;
  }
}

// Technician submits BEFORE evidence (address, before image, fix time)
exports.uploadBeforeEvidence = [
  upload.single('beforeImage'),
  async (req, res) => {
    const { id } = req.params;
    const { address, fixTime } = req.body;
    const beforeImage = req.file ? `/uploads/${req.file.filename}` : null;
    // Calculate deadline: now + fixTime (minutes)
    const now = new Date();
    let fixDeadline = null;
    if (fixTime && !isNaN(Number(fixTime))) {
      fixDeadline = new Date(now.getTime() + Number(fixTime) * 60000);
    }
    // Only set to IN PROGRESS if currently PENDING or ASSIGNED
    const issue = await service.getById(id);
    let newStatus = 'IN PROGRESS';
    if (issue && issue.status && !['PENDING', 'ASSIGNED'].includes(issue.status.toUpperCase())) {
      newStatus = issue.status; // Don't overwrite if already in progress or later
    }
    const updateData = {
      address,
      beforeImage,
      fixTime,
      fixDeadline,
      status: newStatus,
      overdue: false,
    };
    const senderName = await resolveActorName(req.user, 'Technician');
    const senderRole = req.user?.role || 'technician';
    const lifecycleMessage = getStatusLifecycleMessage(newStatus);
    if (lifecycleMessage) {
      updateData.chat = appendSystemChatMessage(Array.isArray(issue?.chat) ? issue.chat : [], lifecycleMessage, {
        sender: senderName,
        role: senderRole
      });
    }
    const updated = await service.update(id, updateData);

    // Send In-Progress notifications
    try {
      const userService = require('../user/user.service');
      const client = await userService.findUserById(updated.userId);
      const technician = req.user ? await userService.findUserById(req.user.userId) : null;

      // In-app for client
      if (updated.userId) {
        await notificationService.createNotification({
          userId: updated.userId,
          title: "Work Started",
          message: `Technician has started working on "${updated.title}"`,
          type: "info",
          link: `/client-dashboard?id=${updated.id}`
        });
      }

      // In-app for admins
      await notificationService.notifyAdmins({
        title: "Work Started",
        message: `Work has started on issue "${updated.title}"`,
        type: "info",
        link: `/manager-dashboard?tab=work-order&id=${updated.id}`
      });

      // Email notifications
      await emailService.sendIssueInProgressNotification(updated, technician || { name: 'Technician' }, client || { email: null });

      const technicianName = technician?.name || req.user?.name || 'Technician';
      await sendSmsToUser(
        client,
        `${technicianName} started work on ${formatIssueSmsContext(updated)}.`,
        'issue in-progress'
      );
      await sendSmsToCompanyRoles({
        companyName: updated.companyName,
        roles: ['admin', 'manager'],
        body: `Work started on ${formatIssueSmsContext(updated)}.`,
        context: 'issue in-progress',
      });
    } catch (err) {
      console.error('Error sending in-progress notifications:', err);
    }

    res.json(normalizeExtendedJSON(updated));
  }
];

// Technician submits AFTER evidence (after image)
exports.uploadAfterEvidence = [
  upload.single('afterImage'),
  async (req, res) => {
    const { id } = req.params;
    const afterImage = req.file ? `/uploads/${req.file.filename}` : null;
    // Fetch issue to check deadline
    const issue = await service.getById(id);
    let status = 'COMPLETED';
    let overdue = false;
    if (issue && issue.fixDeadline) {
      const now = new Date();
      const deadline = new Date(issue.fixDeadline);
      if (now > deadline) {
        status = 'COMPLETED'; // or OVERDUE, but let's just make it completed
        overdue = true;
      }
    }
    const updateData = {
      afterImage,
      status,
      overdue,
    };
    const senderName = await resolveActorName(req.user, 'Technician');
    const senderRole = req.user?.role || 'technician';
    const lifecycleMessage = getStatusLifecycleMessage(status);
    if (lifecycleMessage) {
      updateData.chat = appendSystemChatMessage(Array.isArray(issue?.chat) ? issue.chat : [], lifecycleMessage, {
        sender: senderName,
        role: senderRole
      });
    }
    const updated = await service.update(id, updateData);

    // Send Completion notifications
    try {
      const userService = require('../user/user.service');
      const client = await userService.findUserById(updated.userId);
      const technician = req.user ? await userService.findUserById(req.user.userId) : null;

      let techName = technician ? technician.name : 'Technician';
      if (!technician && updated.assignedTo) {
        // Attempt to extract string name if it's not a user
        if (typeof updated.assignedTo === 'string' && isNaN(Number(updated.assignedTo))) {
          techName = updated.assignedTo;
        } else if (updated.assignedTo.name) {
          techName = updated.assignedTo.name;
        }
      }

      // Email notification
      await emailService.sendIssueCompletedNotification({
        ...updated,
        feedback: req.body.feedback || null,
        beforeImage: updated.beforeImage,
        afterImage: afterImage,
        technicianName: techName
      }, technician || { name: techName }, client || { email: null });

      await sendSmsToUser(
        client,
        `${techName} completed work on ${formatIssueSmsContext(updated)}.`,
        'issue completed'
      );
      await sendSmsToCompanyRoles({
        companyName: updated.companyName,
        roles: ['admin', 'manager'],
        body: `${techName} completed ${formatIssueSmsContext(updated)}.`,
        context: 'issue completed',
      });

      // In-app notification for client
      if (updated.userId) {
        await notificationService.createNotification({
          userId: updated.userId,
          title: "Issue Completed",
          message: `Your issue "${updated.title}" has been completed.`,
          type: "success",
          link: `/client-dashboard?id=${updated.id}`
        });
      }

      // In-app notification for admins
      await notificationService.notifyAdmins({
        title: "Issue Completed",
        message: `Issue "${updated.title}" has been completed by ${techName}.`,
        type: "success",
        link: `/manager-dashboard?tab=work-order&id=${updated.id}`
      });
    } catch (err) {
      console.error('Error sending completion notifications:', err);
    }

    res.json(normalizeExtendedJSON(updated));
  }
];
// Assign an issue to a technician
exports.assignToTech = async (req, res) => {
  const { id } = req.params; // issue id
  const { techId, priority, dueDate, status } = req.body; // technician user id
  if (!techId) return res.status(400).json({ error: 'techId is required' });
  if (req.user && (req.user.role === 'technician' || req.user.role === 'internal')) {
    const currentUserId = normalizeId(req.user.userId || req.user.id || req.user._id);
    const requestedTechId = normalizeId(techId);
    if (!currentUserId || !requestedTechId || currentUserId !== requestedTechId) {
      return res.status(403).json({ error: 'Technicians can only assign issues to themselves' });
    }

    const issue = await service.getById(id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const companyMatches = !req.user.companyName
      || !issue.companyName
      || String(req.user.companyName).trim().toLowerCase() === String(issue.companyName || '').trim().toLowerCase();
    if (!companyMatches) {
      return res.status(403).json({ error: 'You can only assign issues from your own company' });
    }
  }
  // Fetch technician info from users table
  const userService = require('../user/user.service');
  const tech = await userService.findUserById(techId);
  let techSource = 'user';
  let externalTech = null;
  if (!tech) {
    // Try to find an external technician (admin-created) in Prisma
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      externalTech = await prisma.technician.findUnique({ where: { id: techId } });
      if (externalTech) techSource = 'external';
    } catch (e) {
      console.error('Error querying Prisma for external technician:', e);
    }
  }
  if (!tech && !externalTech) return res.status(404).json({ error: 'Technician not found' });
  if (req.user && (req.user.role === 'client' || req.user.role === 'requestor')) {
    const issue = await service.getById(id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const issueUserId = normalizeId(issue.userId);
    const requesterId = normalizeId(req.user.userId);
    if (issueUserId && issueUserId !== requesterId) {
      return res.status(403).json({ error: 'Clients can only assign their own issues' });
    }

    if (!tech) {
      return res.status(403).json({ error: 'Clients can only assign company users' });
    }

    if (!req.user.companyName || String(tech.companyName || '').trim() !== String(req.user.companyName || '').trim()) {
      return res.status(403).json({ error: 'You can only assign people from your own company' });
    }
  }
  // The user assigning the task (from auth)
  const assigner = req.user;
  const assignerInfo = {
    id: assigner.userId,
    name: assigner.name,
    email: assigner.email,
    phone: assigner.phone,
    role: assigner.role,
    status: assigner.status,
  };
  const resolvedAssignee = buildAssigneePayload(
    tech || externalTech,
    techSource === 'external' ? 'technician' : (tech?.role || 'technician')
  );
  const updateData = {
    // If technician is a user, link assignedTo to their user id; otherwise use external technician id
    assignedTo: tech ? (tech.id || tech._id) : (externalTech ? externalTech.id : null),
    assignees: resolvedAssignee ? [resolvedAssignee] : [],
  };
  if (priority) updateData.priority = priority;
  if (dueDate) updateData.fixDeadline = new Date(dueDate);
  if (status) updateData.status = status;

  const updated = await service.update(id, updateData);
  console.log('[assignToTech] updated issue:', updated);
  // Send email notification to technician
  try {
    // Prepare recipient data for email notification
    const techRecipient = tech || externalTech || {};
    await emailService.sendIssueAssignedNotification(
      {
        title: updated.title,
        description: updated.description,
        location: updated.location || updated.address,
        priority: updated.priority || 'Normal'
      },
      techRecipient,
      assigner
    );
  } catch (emailError) {
    console.error('Error sending technician assignment notification:', emailError);
  }

  await sendSmsToUser(
    techRecipient,
    `You have been assigned to ${formatIssueSmsContext(updated)}. Priority: ${updated.priority || 'Normal'}.`,
    'technician assignment'
  );

  // In-app notification for technician
  try {
    // Only create in-app notification if we have a linked user id
    const notifyUserId = (tech && (tech.id || tech._id)) ? (tech.id || tech._id) : null;
    if (notifyUserId) {
      await notificationService.createNotification({
        userId: notifyUserId,
        title: "New Issue Assigned",
        message: `You have been assigned to: ${updated.title}`,
        type: "info",
        link: `/technician-dashboard?tab=assigned-issues&id=${updated.id}`
      });
    }
  } catch (notifyErr) {
    console.error('Error creating in-app assignment notification:', notifyErr);
  }
  res.json(normalizeExtendedJSON(updated));
};
// Assign an issue to an internal technician (property staff)
exports.assignToInternal = async (req, res) => {
  const { id } = req.params; // issue id
  const { internalTechId, dueDate } = req.body;
  if (!internalTechId) return res.status(400).json({ error: 'internalTechId is required' });
  try {
    const internalTechModel = require('../internalTechnician/internalTechnician.model');
    const tech = await internalTechModel.findById(internalTechId);
    if (!tech) return res.status(404).json({ error: 'Internal technician not found' });
    // Validate the issue and the assigner
    const issue = await service.getById(id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    // Only allow clients/requestors to assign their own issues
    if (req.user && (req.user.role === 'client' || req.user.role === 'requestor')) {
      const issueUserId = normalizeId(issue.userId);
      const requesterId = normalizeId(req.user.userId);
      console.log('[assignToInternal] ownership check:', { issueUserIdRaw: issue.userId, requesterRaw: req.user.userId, issueUserId, requesterId });
      // If the issue has an owner, only that owner can assign. If issue has no owner (null/''), allow client to request assignment.
      if (issueUserId && issueUserId !== requesterId) {
        return res.status(403).json({ error: 'Clients can only assign their own issues' });
      }
    }
    // Ensure client/requestor assigns only to their own internal techs
    if (req.user && (req.user.role === 'client' || req.user.role === 'requestor')) {
      const propertyModel = require('../property/property.model');
      const props = await propertyModel.findAll({
        OR: [
          { userId: req.user.userId },
          { clientId: req.user.userId },
          { requestorId: req.user.userId }
        ]
      });
      const propertyIds = props.map(p => p.id || p._id).filter(Boolean).map(String);
      const techPropertyId = tech.propertyId || tech.property?.id || tech.property?._id;
      if (!techPropertyId || !propertyIds.includes(String(techPropertyId))) {
        return res.status(403).json({ error: 'You can only assign technicians for your own locations' });
      }
    }
    // The user assigning the task (from auth)
    const assigner = req.user || { userId: null, name: 'System' };
    const assignerInfo = {
      id: assigner.userId || null,
      name: assigner.name || 'System',
      email: assigner.email || '',
      phone: assigner.phone || null,
      role: assigner.role || 'system'
    };

    // Try to find a linked User account for this internal technician (match by email or phone)
    const userService = require('../user/user.service');
    let linkedUser = null;
    try {
      if (tech.email) linkedUser = await userService.findUserByEmail(tech.email);
      // If not found by email, try by phone (if phone lookup exists in user service)
      if (!linkedUser && tech.phone) {
        // userService doesn't have a findByPhone helper; try getAll and match
        const allUsers = await userService.getAllUsers();
        linkedUser = allUsers.find(u => (u.email === tech.email) || (u.phone === tech.phone)) || null;
      }
    } catch (e) {
      linkedUser = null;
    }

    // Build assignees array: include the assigner and record the internal tech info
    const internalAssignee = buildAssigneePayload(tech, 'internal');

    const updatePayload = {
      assignees: internalAssignee ? [internalAssignee] : [],
      status: 'IN PROGRESS'
    };
    if (dueDate) updatePayload.fixDeadline = new Date(dueDate);


    // If a linked User exists, set assignedTo to that user's id so they can fetch assigned issues
    if (linkedUser && (linkedUser.id || linkedUser._id)) {
      updatePayload.assignedTo = linkedUser.id || linkedUser._id;
    } else if (internalAssignee?.id) {
      updatePayload.assignedTo = internalAssignee.id;
    }

    const updated = await service.update(id, updatePayload);

    // Notify internal technician via email (using their email)
    try {
      await emailService.sendNewRequestToRecipients({
        title: updated.title,
        description: updated.description,
        location: updated.location || updated.address,
        category: updated.category || (updated.tags && updated.tags[0]) || 'General',
        priority: updated.priority || 'Normal'
      }, { name: assignerInfo.name, email: assignerInfo.email }, [tech.email]);
    } catch (emailErr) {
      console.error('Error notifying internal technician:', emailErr);
    }

    await sendSmsToUser(
      tech,
      `You have been assigned to ${formatIssueSmsContext(updated)}. Priority: ${updated.priority || 'Normal'}.`,
      'internal technician assignment'
    );

    // In-app notification for internal technician
    if (linkedUser) {
      try {
        await notificationService.createNotification({
          userId: linkedUser.id || linkedUser._id,
          title: "New Issue Assigned",
          message: `You have been assigned to: ${updated.title}`,
          type: "info",
          link: `/technician-dashboard?tab=assigned-issues&id=${updated.id}`
        });
      } catch (notifyErr) {
        console.error('Error creating in-app assignment notification for internal tech:', notifyErr);
      }
    }

    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[assignToInternal]', err);
    res.status(500).json({ error: err.message });
  }
};

// Resubmit an issue so admins/managers can reassign (flag for review)
exports.resubmitIssue = async (req, res) => {
  const { id } = req.params;
  try {
    const user = req.user || {};
    const updateData = {
      resubmitted: true,
      resubmittedAt: new Date(),
      resubmittedBy: user.userId || null,
      status: 'PENDING'
    };
    const updated = await service.update(id, updateData);

    // Notify admins/managers about the resubmission
    try {
      const userService = require('../user/user.service');
      let client = null;
      if (updated.userId) client = await userService.findUserById(updated.userId);
      const anonClient = client || { name: user.name || 'Requester', email: user.email || '' };
      await emailService.sendNewRequestNotification({
        title: updated.title,
        description: updated.description,
        location: updated.location || updated.address,
        category: updated.category || (updated.tags && updated.tags[0]) || 'General',
        priority: updated.priority || 'Normal'
      }, anonClient);
    } catch (emailErr) {
      console.error('Error sending resubmission notification:', emailErr);
    }

    // In-app notification for admins/managers about resubmission
    try {
      await notificationService.notifyAdmins({
        title: "Issue Resubmitted for Review",
        message: `Issue "${updated.title}" has been resubmitted and requires review.`,
        type: "warning",
        link: `/manager-dashboard?tab=manage-issue&id=${updated.id}`
      });
    } catch (notifyErr) {
      console.error('Error creating in-app resubmission notification:', notifyErr);
    }

    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[resubmitIssue]', err);
    res.status(500).json({ error: err.message });
  }
};
const service = require('./issue.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get issues based on user role

// Helper to attach client name to each issue
const userService = require('../user/user.service');
async function attachClientNames(issues) {
  // Get unique userIds
  const userIds = [...new Set(issues.map(i => i.userId).filter(Boolean))];
  // Fetch all users in one go
  const users = await Promise.all(userIds.map(id => userService.findUserById(id)));
  const userMap = {};
  users.forEach(u => { if (u) userMap[u.id || u._id] = u.name; });
  // Attach clientName to each issue
  return issues.map(issue => ({ ...issue, clientName: userMap[issue.userId] || 'Unknown' }));
}

const DEFAULT_PREVENTIVE_FREQUENCY = 'MONTHLY';
const isPreventiveIssue = (issue = {}) => {
  const title = String(issue.title || '').toLowerCase();
  const category = String(issue.category || '').toLowerCase();
  const issueType = String(issue.issueType || issue.type || '').toLowerCase();
  const tags = Array.isArray(issue.tags) ? issue.tags : [];
  const tagsLower = tags.map(t => {
    if (!t) return '';
    if (typeof t === 'string') return t.toLowerCase();
    if (typeof t === 'object' && t.label) return String(t.label).toLowerCase();
    return String(t).toLowerCase();
  });
  return tagsLower.includes('preventive') || issueType === 'preventive' || category === 'preventive' || title.includes('preventive');
};

const backfillPreventiveFrequency = async (issues = []) => {
  const candidates = issues.filter(issue => isPreventiveIssue(issue) && !issue.frequency);
  if (candidates.length === 0) return issues;
  await Promise.all(
    candidates.map(async (issue) => {
      const id = issue.id || issue._id;
      if (!id) return;
      try {
        await service.update(id, { frequency: DEFAULT_PREVENTIVE_FREQUENCY });
      } catch (err) {
        console.error('[backfillPreventiveFrequency] Failed to update issue', id, err);
      }
    })
  );
  return issues.map(issue => (
    isPreventiveIssue(issue) && !issue.frequency
      ? { ...issue, frequency: DEFAULT_PREVENTIVE_FREQUENCY }
      : issue
  ));
};

exports.getByRole = async (req, res) => {
  const user = req.user;
  const propertyId = req.query && (req.query.propertyId || req.query.propertyID || req.query.propertyid);

  // If a propertyId query param is provided, return issues for that property (allowing guest access)
  if (propertyId) {
    try {
      let issues = await service.getByPropertyId(propertyId, req.user?.companyName);
      issues = await attachClientNames(issues);
      issues = await backfillPreventiveFrequency(issues);
      return res.json(normalizeExtendedJSON(issues));
    } catch (e) {
      console.error('Error in getByRole with propertyId:', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Otherwise, unauthorized for anonymous users
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  let issues = [];
  const companyName = req.user?.companyName || null;
  if (user.role === 'superadmin') {
    issues = await service.getAll(null);
    issues = await attachClientNames(issues);
  } else if ((user.role === 'admin' || user.role === 'manager') && companyName) {
    issues = await getCompanyScopedIssues(companyName);
    issues = await attachClientNames(issues);
  } else if (user.role === 'admin') {
    issues = await service.getAll(null);
    issues = await attachClientNames(issues);
  } else if (user.role === 'manager') {
    issues = await service.getByManagerId ? await service.getByManagerId(user.userId) : [];
    issues = await attachClientNames(issues);
  } else if (user.role === 'technician' || user.role === 'internal') {
    // Issues explicitly assigned to this technician
    const assigned = await service.getByAssignedTech(user.userId, companyName);
    // Issues linked to properties where this technician is listed (by email/phone)
    const propLinked = await service.getByTechnicianProperties(user.userId, companyName);
    // Merge and deduplicate
    const map = new Map();
    [...assigned, ...propLinked].forEach(i => { if (i && i.id) map.set(i.id, i); });
    issues = Array.from(map.values());
    issues = await attachClientNames(issues);
  } else if (user.role === 'client' || user.role === 'requestor') {
    if (companyName) {
      issues = await getCompanyScopedIssues(companyName);
    } else {
      const propertyModel = require('../property/property.model');
      const clientProperties = await propertyModel.findAll({
        OR: [
          { userId: user.userId },
          { clientId: user.userId },
          { requestorId: user.userId }
        ]
      });
      const propertyIds = clientProperties.map(p => p.id);
      if (propertyIds.length > 0) {
        issues = await service.getByPropertyIds(propertyIds, null);
      } else {
        issues = [];
      }
    }
    issues = await attachClientNames(issues);
  }

  issues = await backfillPreventiveFrequency(issues);
  res.json(normalizeExtendedJSON(issues));
};

exports.getByUserId = async (req, res) => {
  let issues = await service.getByUserId(req.params.userId);
  issues = await backfillPreventiveFrequency(issues);
  res.json(normalizeExtendedJSON(issues));
};

exports.getByAssignedTech = async (req, res) => {
  let issues = await service.getByAssignedTech(req.params.techId);
  issues = await backfillPreventiveFrequency(issues);
  res.json(normalizeExtendedJSON(issues));
};

exports.getById = async (req, res) => {
  // Validate ID parameter
  if (!req.params.id || req.params.id === 'undefined' || !/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid issue ID' });
  }
  let issue = await service.getById(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Not found' });
  const backfilled = await backfillPreventiveFrequency([issue]);
  issue = backfilled && backfilled.length ? backfilled[0] : issue;
  res.json(normalizeExtendedJSON(issue));
};

exports.create = async (req, res) => {
  try {
    let data = req.body;
    let resolvedPublicCompany = null;

    console.log('[CREATE ISSUE] Received request with userId from auth:', req.user?.userId);
    console.log('[CREATE ISSUE] Received data fields:', Object.keys(data).slice(0, 10));

    // Parse JSON fields sent as strings (tags, assignees)
    if (typeof data.tags === 'string') {
      try { data.tags = JSON.parse(data.tags); } catch (e) { data.tags = [data.tags]; }
    }
    if (typeof data.assignees === 'string') {
      try { data.assignees = JSON.parse(data.assignees); } catch (e) { data.assignees = [data.assignees]; }
    }
    if (typeof data.checklist === 'string') {
      try { data.checklist = JSON.parse(data.checklist); } catch (e) { /* keep as-is */ }
    }
    if (typeof data.chat === 'string') {
      try { data.chat = JSON.parse(data.chat); } catch (e) { /* keep as-is */ }
    }
    if (typeof data.additionalResponsibleWorkers === 'string') {
      try { data.additionalResponsibleWorkers = JSON.parse(data.additionalResponsibleWorkers); } catch (e) { data.additionalResponsibleWorkers = [data.additionalResponsibleWorkers]; }
    }
    if (data.estimatedTime) data.estimatedTime = parseFloat(data.estimatedTime);
    if ('fixDeadline' in data) {
      const normalizedFixDeadline = normalizeDateInput(data.fixDeadline);
      if (normalizedFixDeadline === undefined) {
        delete data.fixDeadline;
      } else {
        data.fixDeadline = normalizedFixDeadline;
      }
    }
    if (!Array.isArray(data.chat) || data.chat.length === 0) {
      const senderName = data.name || data.email || await resolveActorName(req.user, 'Requester');
      const senderRole = req.user?.role || 'requestor';
      data.chat = appendSystemChatMessage([], 'Request submitted.', { sender: senderName, role: senderRole });
    }
    // Ensure overdue is boolean
    if (typeof data.overdue === 'string') {
      data.overdue = data.overdue === 'true';
    }
    if (!req.user && data.publicCompanySlug) {
      try {
        const userService = require('../user/user.service');
        resolvedPublicCompany = await userService.findCompanyBySlug(data.publicCompanySlug);
      } catch (e) {
        console.error('Error resolving public request company slug:', e);
      }

      if (!resolvedPublicCompany) {
        return res.status(400).json({ error: 'Invalid public request link.' });
      }

      data.companyName = resolvedPublicCompany.companyName;
    }
    // Attach image path if file uploaded
    // handle single 'photo' or multiple 'file' attachments (from WorkOrder)
    if (req.file) {
      data.photo = `/uploads/${req.file.filename}`;
    }
    if (req.files) {
      // multer fields: req.files.photo => [file], req.files.file => [file,...]
      if (req.files.photo && req.files.photo.length) {
        data.photo = `/uploads/${req.files.photo[0].filename}`;
      }
      if (req.files.file && req.files.file.length) {
        data.files = (req.files.file || []).map(f => `/uploads/${f.filename}`);
      }
    }
    // Attach user/company from auth (guard when anonymous requests are allowed)
    if (req.user && req.user.userId) {
      data.userId = req.user.userId;
      data.companyName = req.user.companyName || data.companyName;
      console.log('[CREATE ISSUE] Set userId from auth:', data.userId, 'company:', data.companyName);
      try {
        const userService = require('../user/user.service');
        const me = await userService.findUserById(req.user.userId);
        if (me) {
          if (!data.name) data.name = me.name;
          if (!data.email) data.email = me.email;
          if (!data.phone) data.phone = me.phone;
        }
      } catch (e) {
        console.warn('Could not enrich issue with user profile', e?.message);
      }
    }
    // Support linking to an asset by id
    if (data.assetId && typeof data.assetId !== 'string') {
      try { data.assetId = String(data.assetId); } catch (e) { /* ignore */ }
    }
    // Clean up assetId if it contains commas (multiple IDs concatenated incorrectly)
    if (data.assetId && typeof data.assetId === 'string' && data.assetId.includes(',')) {
      const ids = data.assetId.split(',').filter(id => id && id.trim());
      data.assetId = ids.length > 0 ? ids[0].trim() : null;
    }
    // Always set status to PENDING on creation
    data.status = 'PENDING';

    // Filter data to only include valid Issue model fields
    const validFields = [
      'rejected', 'rejectedAt', 'rejectionReason', 'id', 'title', 'description', 'location',
      'assetId', 'propertyId', 'tags', 'assignees', 'overdue', 'time', 'photo', 'userId', 'assignedTo',
      'anonId', 'submissionType', 'name', 'email', 'phone', 'files',
      'address', 'beforeImage', 'afterImage', 'fixTime', 'fixDeadline', 'status', 'approved',
      'inspectorId', 'requestorId', 'companyName',
      'approvedAt', 'createdAt', 'updatedAt',
      'category', 'closeoutNotes', 'closeoutNote', 'closeout', 'assetName', 'team', 'additionalResponsibleWorkers', 'checklist', 'estimatedTime', 'signature', 'priority', 'frequency', 'chat'
    ];
    const filteredData = {};
    for (const field of validFields) {
      if (data[field] !== undefined) {
        filteredData[field] = data[field];
      }
    }

    // Validate userId if present
    if (filteredData.userId) {
      try {
        const userService = require('../user/user.service');
        const user = await userService.findUserById(filteredData.userId);
        if (!user) {
          console.warn('[CREATE ISSUE] userId does not exist in Users table:', filteredData.userId);
          delete filteredData.userId;
        }
      } catch (e) {
        console.error('[CREATE ISSUE] Error validating userId:', e);
        delete filteredData.userId;
      }
    }

    console.log('[CREATE ISSUE] Filtered data userId:', filteredData.userId);
    console.log('[CREATE ISSUE] Filtered data propertyId:', filteredData.propertyId);
    console.log('[CREATE ISSUE] Filtered data title:', filteredData.title);

    // Auto-detect preventive
    try {
      const title = (data.title || '').toString().toLowerCase();
      const rawTags = Array.isArray(data.tags) ? data.tags : [];
      const tagsLower = rawTags.map(t => {
        if (!t) return '';
        if (typeof t === 'string') return String(t).toLowerCase();
        if (typeof t === 'object' && t.label) return String(t.label).toLowerCase();
        return String(t).toLowerCase();
      });
      const issueType = String(data.issueType || data.type || data.category || '').toLowerCase();
      const isPreventive = tagsLower.some((tag) => String(tag).includes('prevent')) || issueType.includes('prevent') || title.includes('prevent');
      if (isPreventive) {
        // ensure tags array
        if (!Array.isArray(data.tags)) data.tags = [];
        if (!data.tags.map(t => (typeof t === 'string' ? t.toLowerCase() : (t && t.label ? String(t.label).toLowerCase() : String(t).toLowerCase()))).includes('preventive')) {
          data.tags.push('preventive');
        }
        data.issueType = data.issueType || 'preventive';
        data.category = data.category || 'preventive';
        if (!filteredData.frequency) {
          filteredData.frequency = data.frequency || DEFAULT_PREVENTIVE_FREQUENCY;
        }
      }
    } catch (e) {
      console.error('Error during preventive detection on create:', e);
    }
    // Normalize requestType / requestedType (inspection vs request)
    try {
      const incomingRequestType = (data.requestedType || data.requestType || data.submissionType || '').toString().toLowerCase();

      // Prefer authenticated client users: if the requester is authenticated and has role 'client'
      // and their user record exists, treat as an 'inspection'. If the user is not found in Users
      // table, fall back to 'request' (anonymous-like behavior).
      let resolvedSubmissionType = null;
      try {
        const userService = require('../user/user.service');
        if (req.user && req.user.userId) {
          const requester = await userService.findUserById(req.user.userId);
          if (requester && req.user.role === 'client') {
            resolvedSubmissionType = 'inspection';
            // ensure we link to the verified user id
            filteredData.userId = req.user.userId;
          } else {
            // If token present but user not found, remove userId to treat as anonymous
            if (!requester) {
              delete filteredData.userId;
            }
          }
        }
      } catch (innerErr) {
        // ignore userService failures and fallback to incoming/default logic
        console.error('Warning: userService lookup failed while normalizing submissionType', innerErr && innerErr.message);
      }

      if (!resolvedSubmissionType) {
        if (incomingRequestType) {
          if (incomingRequestType.includes('inspect') || incomingRequestType === 'inspection' || incomingRequestType === 'authenticated') {
            resolvedSubmissionType = 'inspection';
          } else if (incomingRequestType.includes('request') || incomingRequestType === 'requestor' || incomingRequestType === 'anonymous') {
            resolvedSubmissionType = 'request';
          } else {
            resolvedSubmissionType = incomingRequestType;
          }
        } else {
          // Default: authenticated submissions => inspection, anonymous => request
          resolvedSubmissionType = filteredData.userId ? 'inspection' : 'request';
        }
      }

      filteredData.submissionType = resolvedSubmissionType;

      // Map to explicit inspector/requestor fields for clarity
      if (filteredData.userId) {
        filteredData.inspectorId = filteredData.userId;
      } else {
        // Use anonId or generate a lightweight requestor token
        filteredData.requestorId = filteredData.anonId || ('anon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
      }

      // Ensure tags array exists and mirror requestType into tags for backwards compatibility
      if (!Array.isArray(filteredData.tags)) filteredData.tags = Array.isArray(data.tags) ? data.tags : [];
      const tagsLower = (filteredData.tags || []).map(t => (typeof t === 'string' ? t.toLowerCase() : (t && t.label ? String(t.label).toLowerCase() : String(t).toLowerCase())));
      if (filteredData.submissionType === 'inspection' && !tagsLower.includes('inspection')) {
        filteredData.tags.push('inspection');
      }
      if (filteredData.submissionType === 'request' && !tagsLower.includes('requestor') && !tagsLower.includes('request')) {
        filteredData.tags.push('requestor');
      }
    } catch (e) {
      console.error('Error normalizing requestType:', e);
    }
    // Handle explicit internal technician assignment by client
    let assignedInternalTechConfig = null;
    if (data.internalTechnicianId) {
      try {
        const internalTechModel = require('../internalTechnician/internalTechnician.model');
        const tech = await internalTechModel.findById(data.internalTechnicianId);
        if (tech) {
          // Build assignee object for internal tech
          const internalAssignee = {
            id: tech.id || tech._id,
            name: tech.name,
            email: tech.email || '',
            phone: tech.phone || null,
            role: 'internal'
          };

          // Add to assignees list
          if (!filteredData.assignees) filteredData.assignees = [];
          filteredData.assignees.push(internalAssignee);
          filteredData.status = 'IN PROGRESS'; // Auto-start if assigned

          // Try to link to a User account for assignedTo field
          const userService = require('../user/user.service');
          let linkedUser = null;
          if (tech.email) linkedUser = await userService.findUserByEmail(tech.email);
          if (!linkedUser && tech.phone) {
            const allUsers = await userService.getAllUsers();
            linkedUser = allUsers.find(u => (u.email === tech.email) || (u.phone === tech.phone)) || null;
          }

          if (linkedUser) {
            filteredData.assignedTo = linkedUser.id || linkedUser._id;
          }

          // Store config to send email AFTER creation
          assignedInternalTechConfig = { tech, internalAssignee, linkedUser };
        }
      } catch (e) {
        console.error('Error handling internal technician assignment:', e);
      }
    }

    const created = await service.create(filteredData);

    console.log('[CREATE ISSUE] Issue created with id:', created?.id, 'userId:', created?.userId);

    res.status(201).json(normalizeExtendedJSON(created));

    void (async () => {
    // Send email notification to admins/managers on request/issue creation
    try {
      if (created && created.companyName) {
        await emailService.sendRequestCreatedNotification({
          id: created.id,
          title: created.title,
          description: created.description,
          location: created.location,
          category: created.category || 'General',
          priority: created.priority || 'Normal',
          status: created.status || 'PENDING',
          companyName: created.companyName,
          name: created.name,
          email: created.email,
          phone: created.phone
        });

        if (!issueHasAssignment(created)) {
          await emailService.sendUnassignedWorkAlert({
            id: created.id,
            title: created.title,
            description: created.description,
            location: created.location,
            address: created.address,
            companyName: created.companyName,
            status: created.status || 'PENDING',
            priority: created.priority,
            category: created.category,
            recordType: getIssueRecordType(created),
            link: `/manager-dashboard?tab=manage-issue&id=${created.id || ''}`
          });
        }
        await sendSmsToCompanyRoles({
          companyName: created.companyName,
          roles: ['admin', 'manager'],
          body: `New ${getIssueRecordType(created).toLowerCase()} submitted: ${formatIssueSmsContext(created)}. Status: ${created.status || 'PENDING'}.`,
          context: 'new request',
        });
      }
    } catch (emailErr) {
      console.error('❌ Error sending request created notification:', emailErr);
    }

    // Send email notification to admins/managers AND newly assigned internal tech
    try {
      const userService = require('../user/user.service');
      let client = null;
      if (req.user && req.user.userId) {
        client = await userService.findUserById(req.user.userId);
      }
      const requestPayload = {
        title: data.title,
        description: data.description,
        location: data.location,
        category: data.category || data.tags?.[0] || 'General',
        priority: data.priority || 'Normal'
      };
      const notificationCompanyName = created?.companyName || data.companyName || client?.companyName || resolvedPublicCompany?.companyName || null;

      const assignerInfo = client
        ? { name: client.name, email: client.email }
        : { name: data.name || 'Anonymous', email: data.email || '' };

      // 1. Notify Assigned Internal Technician (if any)
      if (assignedInternalTechConfig && assignedInternalTechConfig.tech.email) {
        await emailService.sendNewRequestToRecipients(
          requestPayload,
          assignerInfo,
          [assignedInternalTechConfig.tech.email]
        );

        // In-app notification for internal technician
        if (assignedInternalTechConfig.linkedUser) {
          try {
            await notificationService.createNotification({
              userId: assignedInternalTechConfig.linkedUser.id || assignedInternalTechConfig.linkedUser._id,
              title: "New Issue Assigned",
              message: `You have been assigned to: ${created.title}`,
              type: "info",
              link: `/technician-dashboard?tab=assigned-issues&id=${created.id}`
            });
          } catch (notifyErr) {
            console.error('Error creating in-app assignment notification for internal tech on create:', notifyErr);
          }
        }
      }

      if (assignedInternalTechConfig?.tech) {
        await sendSmsToUser(
          assignedInternalTechConfig.tech,
          `You have been assigned to ${formatIssueSmsContext(created)}. Priority: ${created.priority || 'Normal'}.`,
          'new internal technician assignment'
        );
      }

      // 2. Notify Admins/Managers (Standard flow)
      if (client) {
        // Authenticated submitter: notify admins/managers as before
        await emailService.sendNewRequestNotification(requestPayload, client, notificationCompanyName);
      } else {
        // Anonymous submit: notify property staff (internalTechnicians) and admins/managers
        try {
          const assetModel = require('../asset/asset.model');
          const propertyModel = require('../property/property.model');
          let staffEmails = [];

          if (data.assetId) {
            try {
              const asset = await assetModel.findById(data.assetId);
              if (asset && asset.propertyId) {
                const property = await propertyModel.findById(asset.propertyId);
                if (property && Array.isArray(property.internalTechnicians)) {
                  staffEmails = property.internalTechnicians.map(t => t.email).filter(Boolean);
                }
              }
            } catch (e) {
              console.error('Error looking up asset/property for anonymous notification:', e);
            }
          }

          // Build a client-like object from submitted fields when available
          const anonClient = { name: data.name || 'Anonymous', email: data.email || '' };

          // Notify property staff if any (only if NOT already notified via direct assignment)
          if (staffEmails.length) {
            // Filter out the explicitly assigned tech if they are in the property staff list to avoid double email
            const explicitlyAssignedEmail = assignedInternalTechConfig?.tech?.email;
            const uniqueStaffEmails = staffEmails.filter(e => e !== explicitlyAssignedEmail);

            if (uniqueStaffEmails.length > 0) {
              await emailService.sendNewRequestToRecipients(requestPayload, anonClient, uniqueStaffEmails);
            }
          }

          // Notify only property owners (clients) and property staff for anonymous submissions.
          try {
            // If we have a propertyId or assetId, try to find the property and its owner
            let ownerEmails = [];
            let ownerUsers = [];
            if (data.propertyId) {
              const propertyModel = require('../property/property.model');
              const property = await propertyModel.findById(data.propertyId);
              if (property) {
                if (property.userId) ownerUsers.push(property.userId);
                if (property.clientId) ownerUsers.push(property.clientId);
                if (Array.isArray(property.internalTechnicians)) {
                  const staffEmails = property.internalTechnicians.map(t => t.email).filter(Boolean);
                  if (staffEmails.length) await emailService.sendNewRequestToRecipients(requestPayload, anonClient, staffEmails);
                }
              }
            } else if (data.assetId) {
              try {
                const assetModel = require('../asset/asset.model');
                const propertyModel = require('../property/property.model');
                const asset = await assetModel.findById(data.assetId);
                if (asset && asset.propertyId) {
                  const property = await propertyModel.findById(asset.propertyId);
                  if (property) {
                    if (property.userId) ownerUsers.push(property.userId);
                    if (property.clientId) ownerUsers.push(property.clientId);
                    if (Array.isArray(property.internalTechnicians)) {
                      const staffEmails = property.internalTechnicians.map(t => t.email).filter(Boolean);
                      if (staffEmails.length) await emailService.sendNewRequestToRecipients(requestPayload, anonClient, staffEmails);
                    }
                  }
                }
              } catch (e) {
                console.error('Error looking up asset/property for anonymous owner notification:', e);
              }
            }

            // De-duplicate and notify owners via email and in-app
            ownerUsers = [...new Set(ownerUsers.filter(Boolean))];
            const userService = require('../user/user.service');
            for (const uid of ownerUsers) {
              try {
                const owner = await userService.findUserById(uid);
                if (owner) {
                  // Email owner
                  try { await emailService.sendNewRequestNotification(requestPayload, owner); } catch (e) { console.error('Error emailing owner on anon create:', e); }
                  await sendSmsToUser(
                    owner,
                    `New maintenance request submitted for your property: ${formatIssueSmsContext(created)}.`,
                    'anonymous request owner alert'
                  );
                  // In-app notification for owner
                  try {
                    await notificationService.createNotification({
                      userId: owner.id || owner._id,
                      title: "New Maintenance Request (Anonymous)",
                      message: `An anonymous request "${created.title}" was submitted for your property.`,
                      type: "info",
                      link: `/client-dashboard?id=${created.propertyId || created.id}`
                    });
                  } catch (e) { console.error('Error creating in-app notification for owner on anon create:', e); }
                }
              } catch (e) {
                console.error('Error notifying owner userId on anonymous create:', e);
              }
            }
          } catch (notifyErr) {
            console.error('Error notifying owners on anonymous issue create:', notifyErr);
          }
        } catch (notifyErr) {
          console.error('Error notifying on anonymous issue create:', notifyErr);
        }

        try {
          await emailService.sendNewRequestNotification(requestPayload, assignerInfo, notificationCompanyName);
        } catch (companyNotifyErr) {
          console.error('Error notifying company admins on anonymous issue create:', companyNotifyErr);
        }
      }
    } catch (emailError) {
      console.error('Error sending new request notification:', emailError);
    }

    // In-app notification for admins
    try {
      const notificationCompanyName = created?.companyName || data.companyName || resolvedPublicCompany?.companyName || null;
      await notificationService.notifyCompanyAdmins({
        companyName: notificationCompanyName,
        title: "New Maintenance Request",
        message: `A new request "${data.title}" has been submitted.`,
        type: "info",
        link: `/manager-dashboard?tab=manage-issue&id=${created.id}`
      });
    } catch (notifyErr) {
      console.error('Error creating in-app new request notification:', notifyErr);
    }

    })();
    return;
  } catch (err) {
    console.error('[CREATE ISSUE CRASH PREVENTED]', err);
    res.status(500).json({ error: 'Failed to create issue: ' + err.message });
  }
};

exports.update = async (req, res) => {
  // Validate ID parameter
  if (!req.params.id || req.params.id === 'undefined' || !/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid issue ID' });
  }
  const oldIssue = await service.getById(req.params.id);
  // Normalize tags in incoming body if provided
  const incoming = { ...req.body };
  
  // Normalize status to uppercase if provided
  if (incoming.status && typeof incoming.status === 'string') {
    incoming.status = incoming.status.toUpperCase();
  }
  
  if (typeof incoming.tags === 'string') {
    try { incoming.tags = JSON.parse(incoming.tags); } catch (e) { /* keep as-is */ }
  }
  if (typeof incoming.checklist === 'string') {
    try { incoming.checklist = JSON.parse(incoming.checklist); } catch (e) { /* keep as-is */ }
  }
  if (typeof incoming.chat === 'string') {
    try { incoming.chat = JSON.parse(incoming.chat); } catch (e) { /* keep as-is */ }
  }
  if (typeof incoming.additionalResponsibleWorkers === 'string') {
    try { incoming.additionalResponsibleWorkers = JSON.parse(incoming.additionalResponsibleWorkers); } catch (e) { /* keep as-is */ }
  }
  if (incoming.estimatedTime) incoming.estimatedTime = parseFloat(incoming.estimatedTime);
  if ('fixDeadline' in incoming) {
    const normalizedFixDeadline = normalizeDateInput(incoming.fixDeadline);
    if (normalizedFixDeadline === undefined) {
      delete incoming.fixDeadline;
    } else {
      incoming.fixDeadline = normalizedFixDeadline;
    }
  }

  const statusFromIncoming = typeof incoming.status === 'string' ? incoming.status.toUpperCase() : null;
  if (oldIssue && statusFromIncoming && oldIssue.status !== statusFromIncoming) {
    const lifecycleMessage = getStatusLifecycleMessage(statusFromIncoming);
    if (lifecycleMessage) {
      const fallbackActor = statusFromIncoming === 'IN PROGRESS' || statusFromIncoming === 'COMPLETED' || statusFromIncoming === 'COMPLETE'
        ? 'Technician'
        : 'Manager';
      const senderName = await resolveActorName(req.user, fallbackActor);
      const senderRole = req.user?.role || (fallbackActor === 'Technician' ? 'technician' : 'manager');
      const baseChat = Array.isArray(incoming.chat) ? incoming.chat : (Array.isArray(oldIssue.chat) ? oldIssue.chat : []);
      incoming.chat = appendSystemChatMessage(baseChat, lifecycleMessage, { sender: senderName, role: senderRole });
    }
  }
  try {
    // Build merged view to apply heuristic: prefer incoming fields when present
    const merged = { ...(oldIssue || {}), ...(incoming || {}) };
    const title = (merged.title || '').toString().toLowerCase();
    const rawTags = Array.isArray(merged.tags) ? merged.tags : [];
    const tagsLower = rawTags.map(t => {
      if (!t) return '';
      if (typeof t === 'string') return String(t).toLowerCase();
      if (typeof t === 'object' && t.label) return String(t.label).toLowerCase();
      return String(t).toLowerCase();
    });
    const issueType = String(merged.issueType || merged.type || merged.category || '').toLowerCase();
    const isPreventive = tagsLower.some((tag) => String(tag).includes('prevent')) || issueType.includes('prevent') || title.includes('prevent');
    if (isPreventive) {
      // ensure tags on incoming update include 'preventive'
      if (!Array.isArray(incoming.tags)) incoming.tags = Array.isArray(oldIssue.tags) ? [...oldIssue.tags] : [];
      const incomingTagsLower = incoming.tags.map(t => (typeof t === 'string' ? t.toLowerCase() : (t && t.label ? String(t.label).toLowerCase() : String(t).toLowerCase())));
      if (!incomingTagsLower.includes('preventive')) {
        incoming.tags.push('preventive');
      }

    }
  } catch (e) {
    console.error('Error during preventive detection on update:', e);
  }

  const updated = await service.update(req.params.id, incoming);
  if (String(updated?.status || '').toUpperCase() === 'APPROVED' || updated?.approved) {
    await ensurePreventiveScheduleForApprovedIssue(updated, req.user);
  }

  if (Array.isArray(incoming.chat)) {
    await notifyMentionedUsers({
      oldChat: oldIssue?.chat || [],
      newChat: updated?.chat || incoming.chat,
      actorUser: req.user,
      issue: updated
    });
  }

  // Send email notifications based on status changes
  try {
    const userService = require('../user/user.service');

    // If status changed, send comprehensive status change notification to admin + client
    if (oldIssue && oldIssue.status !== updated.status) {
      await emailService.sendStatusChangeNotification(
        {
          id: updated.id,
          title: updated.title,
          description: updated.description,
          location: updated.location || updated.address,
          companyName: updated.companyName,
          status: updated.status,
          priority: updated.priority,
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          fixDeadline: updated.fixDeadline,
          beforeImage: updated.beforeImage
        },
        oldIssue.status
      );
    }

    // If status changed to approved/declined, notify client with specific message
    if (oldIssue && oldIssue.status !== updated.status) {
      if (updated.status === 'APPROVED' || updated.status === 'DECLINED') {
        const client = await userService.findUserById(updated.userId);
        const manager = await userService.findUserById(req.user.userId);

        if (client && manager) {
          if (updated.status === 'APPROVED') {
            await emailService.sendRequestApprovedNotification({
              title: updated.title,
              description: updated.description,
              location: updated.location
            }, client, manager);
            await sendSmsToUser(
              client,
              `Your request ${formatIssueSmsContext(updated)} has been approved by ${manager.name || 'your manager'}.`,
              'request approved'
            );
          } else if (updated.status === 'DECLINED') {
            await emailService.sendRequestDeclinedNotification({
              title: updated.title,
              description: updated.description,
              location: updated.location
            }, client, manager, req.body.reason || 'No reason provided');
            await sendSmsToUser(
              client,
              `Your request ${formatIssueSmsContext(updated)} was declined. Reason: ${compactForSms(req.body.reason || 'No reason provided', 90)}.`,
              'request declined'
            );
          }
        }

        // In-app notification for client
        try {
          await notificationService.createNotification({
            userId: updated.userId,
            title: updated.status === 'APPROVED' ? "Request Approved" : "Request Declined",
            message: updated.status === 'APPROVED'
              ? `Your request "${updated.title}" has been approved.`
              : `Your request "${updated.title}" was declined. Reason: ${req.body.reason || 'No reason provided'}`,
            type: updated.status === 'APPROVED' ? "success" : "error",
            link: `/client-dashboard?id=${updated.id}`
          });
        } catch (notifyErr) {
          console.error('Error creating in-app approval/decline notification:', notifyErr);
        }
      }
    }

    // If issue is completed (status changed to COMPLETE), notify manager and client
    if (oldIssue && oldIssue.status !== 'COMPLETE' && updated.status === 'COMPLETE') {
      const client = await userService.findUserById(updated.userId);
      let technician = null;
      if (updated.assignedTechnicianId) {
        technician = await userService.findUserById(updated.assignedTechnicianId);
      }

      if (client && technician) {
        await emailService.sendIssueCompletedNotification({
          title: updated.title,
          description: updated.description,
          location: updated.location || updated.address,
          feedback: updated.feedback || null,
          afterImage: updated.afterImage || null
        }, technician, client);
      }

      await sendSmsToUser(
        client,
        `${technician?.name || 'Technician'} completed ${formatIssueSmsContext(updated)}.`,
        'issue completed'
      );
      await sendSmsToCompanyRoles({
        companyName: updated.companyName,
        roles: ['admin', 'manager'],
        body: `${technician?.name || 'Technician'} completed ${formatIssueSmsContext(updated)}.`,
        context: 'issue completed',
      });
    }

    const becameUnassigned = issueHasAssignment(oldIssue) && !issueHasAssignment(updated);
    const remainsUnassignedAfterRelevantUpdate = !issueHasAssignment(oldIssue) && !issueHasAssignment(updated)
      && (Object.prototype.hasOwnProperty.call(incoming, 'assignedTo') || Object.prototype.hasOwnProperty.call(incoming, 'assignees'));

    if (becameUnassigned || remainsUnassignedAfterRelevantUpdate) {
      await emailService.sendUnassignedWorkAlert({
        id: updated.id,
        title: updated.title,
        description: updated.description,
        location: updated.location,
        address: updated.address,
        companyName: updated.companyName,
        status: updated.status || oldIssue?.status || 'PENDING',
        priority: updated.priority,
        category: updated.category,
        recordType: getIssueRecordType(updated),
        link: `/manager-dashboard?tab=manage-issue&id=${updated.id || ''}`
      });
    }
  } catch (emailError) {
    console.error('Error sending email notification:', emailError);
    // Don't fail the request if email fails
  }

  res.json(normalizeExtendedJSON(updated));
};

exports.getLinks = async (req, res) => {
  try {
    const links = await service.getLinks(req.params.id);
    res.json(links);
  } catch (err) {
    console.error('[issue.controller.js:getLinks]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.addLink = async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const title = body.title ? String(body.title) : '';
    const url = body.url ? String(body.url) : '';
    const type = body.type ? String(body.type) : (url ? 'url' : 'workorder');
    const relationship = body.relationship ? String(body.relationship) : undefined;
    const workOrderId = body.workOrderId ? String(body.workOrderId) : undefined;
    if (!title && !url && !workOrderId) {
      return res.status(400).json({ error: 'Link data is required' });
    }
    const createdBy = await resolveActorName(req.user, 'User');
    const entry = await service.addLink(id, {
      title: title || (workOrderId ? 'Linked Work Order' : 'Link'),
      url,
      type,
      relationship,
      workOrderId,
      createdBy
    });
    res.status(201).json(entry);
  } catch (err) {
    console.error('[issue.controller.js:addLink]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.removeLink = async (req, res) => {
  try {
    const result = await service.removeLink(req.params.id, req.params.linkId);
    res.json(result);
  } catch (err) {
    console.error('[issue.controller.js:removeLink]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getFiles = async (req, res) => {
  try {
    const files = await service.getFiles(req.params.id);
    res.json(files);
  } catch (err) {
    console.error('[issue.controller.js:getFiles]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.addFiles = async (req, res) => {
  try {
    const id = req.params.id;
    const uploaded = Array.isArray(req.files) ? req.files : [];
    if (!uploaded.length) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const createdBy = await resolveActorName(req.user, 'User');
    const entries = uploaded.map((file) => ({
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.originalname,
      url: `/uploads/${file.filename}`,
      size: file.size,
      type: file.mimetype || 'file',
      uploadedAt: new Date().toISOString(),
      uploadedBy: createdBy,
      source: 'remote'
    }));
    const saved = await service.addFiles(id, entries);
    res.status(201).json(saved);
  } catch (err) {
    console.error('[issue.controller.js:addFiles]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getActivity = async (req, res) => {
  try {
    const items = await service.getActivity(req.params.id);
    res.json(items);
  } catch (err) {
    console.error('[issue.controller.js:getActivity]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.addActivity = async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const actorName = await resolveActorName(req.user, 'User');
    const payload = {
      action: body.action || body.title || 'Update',
      detail: body.detail || body.description || '',
      user: body.user || actorName,
      role: body.role || (req.user?.role || 'user'),
      timestamp: body.timestamp || new Date().toISOString(),
      source: body.source || 'remote'
    };
    const saved = await service.addActivity(id, payload);
    res.status(201).json(saved);
  } catch (err) {
    console.error('[issue.controller.js:addActivity]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getCosts = async (req, res) => {
  try {
    const items = await service.getCosts(req.params.id);
    res.json(items);
  } catch (err) {
    console.error('[issue.controller.js:getCosts]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.addCost = async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    if (!body.description || !body.category || body.cost === undefined || body.assignedTo === undefined || !body.date) {
      return res.status(400).json({ error: 'Missing cost fields' });
    }
    const payload = {
      description: String(body.description),
      category: String(body.category),
      cost: Number(body.cost) || 0,
      assignedTo: String(body.assignedTo),
      date: body.date,
      createdBy: body.createdBy || (await resolveActorName(req.user, 'User'))
    };
    const saved = await service.addCost(id, payload);
    res.status(201).json(saved);
  } catch (err) {
    console.error('[issue.controller.js:addCost]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getParts = async (req, res) => {
  try {
    const items = await service.getParts(req.params.id);
    res.json(items);
  } catch (err) {
    console.error('[issue.controller.js:getParts]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.addPart = async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    if (!body.name || body.cost === undefined || body.quantity === undefined) {
      return res.status(400).json({ error: 'Missing part fields' });
    }
    const payload = {
      name: String(body.name),
      status: body.status ? String(body.status) : 'In stock',
      cost: Number(body.cost) || 0,
      quantity: Number(body.quantity) || 1,
      location: body.location ? String(body.location) : '',
      notes: body.notes ? String(body.notes) : '',
      source: body.source || 'remote'
    };
    const saved = await service.addPart(id, payload);
    res.status(201).json(saved);
  } catch (err) {
    console.error('[issue.controller.js:addPart]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.reconcileParts = async (req, res) => {
  try {
    const id = req.params.id;
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (entries.length === 0) {
      return res.status(400).json({ error: 'No parts provided' });
    }
    const saved = await service.reconcileParts(id, entries);
    res.json(saved);
  } catch (err) {
    console.error('[issue.controller.js:reconcileParts]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getLabor = async (req, res) => {
  try {
    const items = await service.getLabor(req.params.id);
    res.json(items);
  } catch (err) {
    console.error('[issue.controller.js:getLabor]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.addLabor = async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    if (!body.technician || (!body.hours && !body.minutes && !body.seconds)) {
      return res.status(400).json({ error: 'Missing labor fields' });
    }
    const payload = {
      technician: String(body.technician),
      rate: Number(body.rate) || 0,
      hours: Number(body.hours) || 0,
      minutes: Number(body.minutes) || 0,
      seconds: Number(body.seconds) || 0,
      cost: Number(body.cost) || 0,
      startedAt: body.startedAt || body.date || new Date().toISOString(),
      category: body.category ? String(body.category) : 'Maintenance',
      createdBy: body.createdBy || (await resolveActorName(req.user, 'User'))
    };
    const saved = await service.addLabor(id, payload);
    res.status(201).json(saved);
  } catch (err) {
    console.error('[issue.controller.js:addLabor]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getProviderPortal = async (req, res) => {
  try {
    const data = await service.getProviderPortal(req.params.id);
    res.json(data);
  } catch (err) {
    console.error('[issue.controller.js:getProviderPortal]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateProviderPortal = async (req, res) => {
  try {
    const payload = await service.updateProviderPortal(req.params.id, req.body || {});
    res.json(payload);
  } catch (err) {
    console.error('[issue.controller.js:updateProviderPortal]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  await service.delete(req.params.id);
  res.status(204).end();
};

// Manager/admin approves an issue
exports.approveIssue = async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await service.getById(id);
    if (!existing) return res.status(404).json({ error: 'Issue not found' });
    if (req.user && (req.user.role === 'client' || req.user.role === 'requestor')) {
      const ownerId = normalizeId(existing.userId || existing.requestorId);
      const requesterId = normalizeId(req.user.userId);
      if (ownerId && requesterId !== ownerId) {
        return res.status(403).json({ error: 'Clients can only approve their own requests' });
      }
    }
    const baseChat = Array.isArray(existing?.chat) ? existing.chat : [];
    const senderName = await resolveActorName(req.user, req.user?.role === 'client' || req.user?.role === 'requestor' ? 'Client' : 'Manager');
    const senderRole = req.user?.role || 'manager';
    const chat = appendSystemChatMessage(baseChat, 'Request approved.', { sender: senderName, role: senderRole });
    const incoming = { ...(req.body || {}) };
    if (typeof incoming.additionalResponsibleWorkers === 'string') {
      try {
        incoming.additionalResponsibleWorkers = JSON.parse(incoming.additionalResponsibleWorkers);
      } catch (e) {
        incoming.additionalResponsibleWorkers = incoming.additionalResponsibleWorkers
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
      }
    }
    if ('fixDeadline' in incoming) {
      const normalizedFixDeadline = normalizeDateInput(incoming.fixDeadline);
      if (normalizedFixDeadline === undefined) {
        delete incoming.fixDeadline;
      } else {
        incoming.fixDeadline = normalizedFixDeadline;
      }
    }
    const allowedFields = [
      'title',
      'description',
      'category',
      'priority',
      'location',
      'propertyId',
      'assetId',
      'assetName',
      'assignedTo',
      'assignees',
      'team',
      'additionalResponsibleWorkers',
      'checklist',
      'estimatedTime',
      'signature',
      'fixDeadline'
    ];
    const approvalPayload = { approved: true, approvedAt: new Date(), status: 'APPROVED', chat };
    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(incoming, field)) {
        approvalPayload[field] = incoming[field];
      }
    });
    const updated = await service.update(id, approvalPayload);
    await ensurePreventiveScheduleForApprovedIssue(updated, req.user);
    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[issue.controller.js:approveIssue]', err);
    res.status(500).json({ error: err.message });
  }
};

// Manager/admin declines an issue
exports.declineIssue = async (req, res) => {
  try {
    const id = req.params.id;
    const reason = req.body.reason || 'Declined by manager';
    const existing = await service.getById(id);
    if (!existing) return res.status(404).json({ error: 'Issue not found' });
    if (req.user && (req.user.role === 'client' || req.user.role === 'requestor')) {
      const ownerId = normalizeId(existing.userId || existing.requestorId);
      const requesterId = normalizeId(req.user.userId);
      if (ownerId && requesterId !== ownerId) {
        return res.status(403).json({ error: 'Clients can only decline their own requests' });
      }
    }
    const baseChat = Array.isArray(existing?.chat) ? existing.chat : [];
    const senderName = await resolveActorName(req.user, req.user?.role === 'client' || req.user?.role === 'requestor' ? 'Client' : 'Manager');
    const senderRole = req.user?.role || 'manager';
    const chat = appendSystemChatMessage(baseChat, 'Request declined.', { sender: senderName, role: senderRole });
    const updated = await service.update(id, { rejected: true, rejectionReason: reason, rejectedAt: new Date(), status: 'DECLINED', chat });
    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[issue.controller.js:declineIssue]', err);
    res.status(500).json({ error: err.message });
  }
};
