const service = require('./issue.service');

// Get issues based on user role
exports.getByRole = async (req, res) => {
  const user = req.user;
  let issues = [];
  if (user.role === 'ADMIN') {
    issues = await service.getAll();
  } else if (user.role === 'TECH') {
    issues = await service.getByAssignedTech(user.id);
  } else if (user.role === 'CLIENT') {
    issues = await service.getByUserId(user.id);
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
  data.userId = req.user.id;
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
