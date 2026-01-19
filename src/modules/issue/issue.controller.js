const upload = require('../../middleware/upload');

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
    res.json(updated);
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
    res.json(updated);
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
  res.json(updated);
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
  let issues = [];
  if (user.role === 'admin') {
    issues = await service.getAll();
    issues = await attachClientNames(issues);
  } else if (user.role === 'technician') {
    issues = await service.getByAssignedTech(user.userId);
    issues = await attachClientNames(issues);
  } else if (user.role === 'client') {
    issues = await service.getByUserId(user.userId);
    issues = await attachClientNames(issues);
  }
  res.json(issues);
};

exports.getByUserId = async (req, res) => {
  const issues = await service.getByUserId(req.params.userId);
  res.json(issues);
};

exports.getByAssignedTech = async (req, res) => {
  const issues = await service.getByAssignedTech(req.params.techId);
  res.json(issues);
};

exports.getById = async (req, res) => {
  const issue = await service.getById(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Not found' });
  res.json(issue);
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
  // Always set status to PENDING on creation
  data.status = 'PENDING';
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
