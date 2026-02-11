const upload = require('../../middleware/upload');
const emailService = require('../emailService/email.service');

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
    // Only set to IN PROGRESS if currently PENDING
    const issue = await service.getById(id);
    let newStatus = 'IN PROGRESS';
    if (issue && issue.status && issue.status !== 'PENDING') {
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
    const updated = await service.update(id, updateData);
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
    let status = 'COMPLETE';
    let overdue = false;
    if (issue && issue.fixDeadline) {
      const now = new Date();
      const deadline = new Date(issue.fixDeadline);
      if (now > deadline) {
        status = 'OVERDUE';
        overdue = true;
      }
    }
    const updateData = {
      afterImage,
      status,
      overdue,
    };
    const updated = await service.update(id, updateData);

    // Send completion email notification
    try {
      const userService = require('../user/user.service');

      const client = await userService.findUserById(updated.userId);
      const technician = await userService.findUserById(req.user.userId);

      if (client && technician) {
        await emailService.sendIssueCompletedNotification({
          title: updated.title,
          description: updated.description,
          location: updated.location || updated.address,
          feedback: req.body.feedback || null,
          afterImage: afterImage
        }, technician, client);
      }
    } catch (emailError) {
      console.error('Error sending completion notification:', emailError);
      // Don't fail the request if email fails
    }

    res.json(normalizeExtendedJSON(updated));
  }
];
// Assign an issue to a technician
exports.assignToTech = async (req, res) => {
  const { id } = req.params; // issue id
  const { techId } = req.body; // technician user id
  if (!techId) return res.status(400).json({ error: 'techId is required' });
  // Fetch technician info from users table
  const userService = require('../user/user.service');
  const tech = await userService.findUserById(techId);
  if (!tech) return res.status(404).json({ error: 'Technician not found' });
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
  const updated = await service.update(id, {
    assignedTo: tech.id,
    assignees: [assignerInfo],
  });
  console.log('[assignToTech] updated issue:', updated);
  // Send email notification to technician
  try {
    await emailService.sendIssueAssignedNotification(
      {
        title: updated.title,
        description: updated.description,
        location: updated.location || updated.address,
        priority: updated.priority || 'Normal'
      },
      tech,
      assigner
    );
  } catch (emailError) {
    console.error('Error sending technician assignment notification:', emailError);
  }
  res.json(normalizeExtendedJSON(updated));
};
// Assign an issue to an internal technician (property staff)
exports.assignToInternal = async (req, res) => {
  const { id } = req.params; // issue id
  const { internalTechId } = req.body;
  if (!internalTechId) return res.status(400).json({ error: 'internalTechId is required' });
  try {
    const internalTechModel = require('../internalTechnician/internalTechnician.model');
    const tech = await internalTechModel.findById(internalTechId);
    if (!tech) return res.status(404).json({ error: 'Internal technician not found' });
    // Validate the issue and the assigner
    const issue = await service.getById(id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    // Only allow clients to assign their own issues
    if (req.user && req.user.role === 'client') {
      const issueUserId = normalizeId(issue.userId);
      const requesterId = normalizeId(req.user.userId);
      console.log('[assignToInternal] ownership check:', { issueUserIdRaw: issue.userId, requesterRaw: req.user.userId, issueUserId, requesterId });
      // If the issue has an owner, only that owner can assign. If issue has no owner (null/''), allow client to request assignment.
      if (issueUserId && issueUserId !== requesterId) {
        return res.status(403).json({ error: 'Clients can only assign their own issues' });
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
    const internalAssignee = {
      id: tech.id || tech._id || tech.id || null,
      name: tech.name,
      email: tech.email || '',
      phone: tech.phone || null,
      role: 'internal'
    };

    const updatePayload = {
      assignees: [assignerInfo, internalAssignee],
      status: 'IN PROGRESS'
    };

    // If a linked User exists, set assignedTo to that user's id so they can fetch assigned issues
    if (linkedUser && (linkedUser.id || linkedUser._id)) {
      updatePayload.assignedTo = linkedUser.id || linkedUser._id;
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

exports.getByRole = async (req, res) => {
  const user = req.user;
  // Anonymous users cannot view issues - they can only submit them
  if (!user) return res.status(401).json({ error: 'Unauthorized' });


  let issues = [];

  // If a propertyId query param is provided, return issues for that property
  const propertyId = req.query && (req.query.propertyId || req.query.propertyID || req.query.propertyid);
  if (propertyId) {
    issues = await service.getByPropertyId(propertyId);
    issues = await attachClientNames(issues);
    return res.json(normalizeExtendedJSON(issues));
  }
  if (user.role === 'admin') {
    issues = await service.getAll();
    issues = await attachClientNames(issues);
  } else if (user.role === 'manager') {
    issues = await service.getByManagerId ? await service.getByManagerId(user.userId) : [];
    issues = await attachClientNames(issues);
  } else if (user.role === 'technician' || user.role === 'internal') {
    // Issues explicitly assigned to this technician
    const assigned = await service.getByAssignedTech(user.userId);
    // Issues linked to properties where this technician is listed (by email/phone)
    const propLinked = await service.getByTechnicianProperties(user.userId);
    // Merge and deduplicate
    const map = new Map();
    [...assigned, ...propLinked].forEach(i => { if (i && i.id) map.set(i.id, i); });
    issues = Array.from(map.values());
    issues = await attachClientNames(issues);
  } else if (user.role === 'client') {
    // For clients: show ONLY issues from their properties
    // - Authenticated issues submitted by this user for their properties
    // - Anonymous issues submitted for their properties



    // Fetch properties owned by this client (userId is the owner)
    // Also include properties where clientId matches, just in case
    const clientProperties = await prisma.property.findMany({
      where: {
        OR: [
          { userId: user.userId },
          { clientId: user.userId }
        ]
      },
      select: { id: true, name: true }
    });
    const propertyIds = clientProperties.map(p => p.id);


    if (propertyIds.length > 0) {
      issues = await service.getByPropertyIds(propertyIds);
    } else {
      issues = [];
    }



    issues = await attachClientNames(issues);
  }

  res.json(normalizeExtendedJSON(issues));
};

exports.getByUserId = async (req, res) => {
  const issues = await service.getByUserId(req.params.userId);
  res.json(normalizeExtendedJSON(issues));
};

exports.getByAssignedTech = async (req, res) => {
  const issues = await service.getByAssignedTech(req.params.techId);
  res.json(normalizeExtendedJSON(issues));
};

exports.getById = async (req, res) => {
  // Validate ID parameter
  if (!req.params.id || req.params.id === 'undefined' || !/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid issue ID' });
  }
  const issue = await service.getById(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Not found' });
  res.json(normalizeExtendedJSON(issue));
};

exports.create = async (req, res) => {
  let data = req.body;

  console.log('[CREATE ISSUE] Received request with userId from auth:', req.user?.userId);
  console.log('[CREATE ISSUE] Received data fields:', Object.keys(data).slice(0, 10));

  // Parse JSON fields sent as strings (tags, assignees)
  if (typeof data.tags === 'string') data.tags = JSON.parse(data.tags);
  if (typeof data.assignees === 'string') data.assignees = JSON.parse(data.assignees);
  // Ensure overdue is boolean
  if (typeof data.overdue === 'string') {
    data.overdue = data.overdue === 'true';
  }
  // Attach image path if file uploaded
  if (req.file) {
    data.photo = `/uploads/${req.file.filename}`;
  }
  // Attach userId from auth (guard when anonymous requests are allowed)
  if (req.user && req.user.userId) {
    data.userId = req.user.userId;
    console.log('[CREATE ISSUE] Set userId from auth:', data.userId);
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
    'anonId', 'submissionType', 'name', 'email', 'phone',
    'address', 'beforeImage', 'afterImage', 'fixTime', 'fixDeadline', 'status', 'approved',
    'approvedAt', 'createdAt', 'updatedAt'
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
    const isPreventive = tagsLower.includes('preventive') || issueType === 'preventive' || title.includes('preventive');
    if (isPreventive) {
      // ensure tags array
      if (!Array.isArray(data.tags)) data.tags = [];
      if (!data.tags.map(t => (typeof t === 'string' ? t.toLowerCase() : (t && t.label ? String(t.label).toLowerCase() : String(t).toLowerCase()))).includes('preventive')) {
        data.tags.push('preventive');
      }
      data.issueType = data.issueType || 'preventive';
      data.category = data.category || 'preventive';
    }
  } catch (e) {
    console.error('Error during preventive detection on create:', e);
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
        assignedInternalTechConfig = { tech, internalAssignee };
      }
    } catch (e) {
      console.error('Error handling internal technician assignment:', e);
    }
  }

  const created = await service.create(filteredData);

  console.log('[CREATE ISSUE] Issue created with id:', created?.id, 'userId:', created?.userId);

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
    }

    // 2. Notify Admins/Managers (Standard flow)
    if (client) {
      // Authenticated submitter: notify admins/managers as before
      await emailService.sendNewRequestNotification(requestPayload, client);
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

        // Also notify global admins/managers
        await emailService.sendNewRequestNotification(requestPayload, anonClient);
      } catch (notifyErr) {
        console.error('Error notifying on anonymous issue create:', notifyErr);
      }
    }
  } catch (emailError) {
    console.error('Error sending new request notification:', emailError);
    // Don't fail the request if email fails
  }

  res.status(201).json(normalizeExtendedJSON(created));
};

exports.update = async (req, res) => {
  // Validate ID parameter
  if (!req.params.id || req.params.id === 'undefined' || !/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid issue ID' });
  }
  const oldIssue = await service.getById(req.params.id);
  // Normalize tags in incoming body if provided
  const incoming = { ...req.body };
  if (typeof incoming.tags === 'string') {
    try { incoming.tags = JSON.parse(incoming.tags); } catch (e) { /* keep as-is */ }
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
    const isPreventive = tagsLower.includes('preventive') || issueType === 'preventive' || title.includes('preventive');
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

  // Send email notifications based on status changes
  try {
    const userService = require('../user/user.service');

    // If status changed to approved/declined, notify client
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
          } else if (updated.status === 'DECLINED') {
            await emailService.sendRequestDeclinedNotification({
              title: updated.title,
              description: updated.description,
              location: updated.location
            }, client, manager, req.body.reason || 'No reason provided');
          }
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
    }
  } catch (emailError) {
    console.error('Error sending email notification:', emailError);
    // Don't fail the request if email fails
  }

  res.json(normalizeExtendedJSON(updated));
};

exports.delete = async (req, res) => {
  await service.delete(req.params.id);
  res.status(204).end();
};

// Manager/admin approves an issue
exports.approveIssue = async (req, res) => {
  try {
    const id = req.params.id;
    const updated = await service.update(id, { approved: true, approvedAt: new Date(), status: 'APPROVED' });
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
    const updated = await service.update(id, { rejected: true, rejectionReason: reason, rejectedAt: new Date(), status: 'DECLINED' });
    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[issue.controller.js:declineIssue]', err);
    res.status(500).json({ error: err.message });
  }
};
