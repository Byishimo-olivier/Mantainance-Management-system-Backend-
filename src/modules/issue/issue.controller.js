const upload = require('../../middleware/upload');
const emailService = require('../emailService/email.service');

const { normalizeExtendedJSON } = require('../../utils/normalize');

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
const service = require('./issue.service');

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
  console.log('[getByRole] user:', user); // DEBUG: log user info
  let issues = [];
  if (user.role === 'admin') {
    issues = await service.getAll();
    issues = await attachClientNames(issues);
  } else if (user.role === 'manager') {
    issues = await service.getByManagerId ? await service.getByManagerId(user.userId) : [];
    issues = await attachClientNames(issues);
  } else if (user.role === 'technician') {
    issues = await service.getByAssignedTech(user.userId);
    issues = await attachClientNames(issues);
  } else if (user.role === 'client') {
    issues = await service.getByUserId(user.userId);
    issues = await attachClientNames(issues);
  }
  console.log('[getByRole] issues:', issues); // DEBUG: log issues array
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
  // Attach userId from auth
  data.userId = req.user.userId;
  // Support linking to an asset by id
  if (data.assetId && typeof data.assetId !== 'string') {
    try { data.assetId = String(data.assetId); } catch (e) { /* ignore */ }
  }
  // Always set status to PENDING on creation
  data.status = 'PENDING';

  // Filter data to only include valid Issue model fields
  const validFields = [
    'rejected', 'rejectedAt', 'rejectionReason', 'id', 'title', 'description', 'location',
    'assetId', 'tags', 'assignees', 'overdue', 'time', 'photo', 'userId', 'assignedTo',
    'address', 'beforeImage', 'afterImage', 'fixTime', 'fixDeadline', 'status', 'approved',
    'approvedAt', 'createdAt', 'updatedAt'
  ];
  const filteredData = {};
  for (const field of validFields) {
    if (data[field] !== undefined) {
      filteredData[field] = data[field];
    }
  }
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
  const created = await service.create(filteredData);

  // Send email notification to admins/managers
  try {
    const userService = require('../user/user.service');
    const client = await userService.findUserById(req.user.userId);

    if (client) {
      await emailService.sendNewRequestNotification({
        title: data.title,
        description: data.description,
        location: data.location,
        category: data.category || data.tags?.[0] || 'General',
        priority: data.priority || 'Normal'
      }, client);
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
