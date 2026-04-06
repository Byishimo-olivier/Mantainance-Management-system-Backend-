const Task = require('./task.model');

const buildTaskPayload = (data = {}, companyName = '') => ({
  title: data.title,
  description: data.description || '',
  dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
  priority: data.priority || 'medium',
  status: data.status || 'upcoming',
  color: data.color || '#3B82F6',
  collaborators: Array.isArray(data.collaborators) ? data.collaborators.map(c => ({
    userId: c.userId,
    name: c.name || '',
    email: c.email || '',
    avatar: c.avatar || ''
  })) : [],
  checklist: Array.isArray(data.checklist) ? data.checklist.map(item => ({
    id: item.id || new (require('mongoose')).Types.ObjectId().toString(),
    title: item.title,
    completed: item.completed || false
  })) : [],
  companyName: data.companyName || companyName,
  userId: data.userId || ''
});

module.exports = {
  async list(req, res) {
    try {
      let tasks = await Task.find().sort({ dueDate: 1, createdAt: -1 });
      const user = req.user;

      // If no user, return empty array for security
      if (!user) {
        console.warn('[Tasks.list] No authenticated user. Returning empty array.');
        return res.json([]);
      }

      // Check if user is admin/manager - they see all items
      const isAdmin = ['admin', 'manager', 'superadmin'].includes(user.role);
      if (!isAdmin) {
        // Regular users only see tasks matching their company
        if (!user.companyName) {
          console.warn('[Tasks.list] Regular user has no companyName. Returning empty array.');
          return res.json([]);
        }
        const userCompanyName = String(user.companyName || '').toLowerCase().trim();
        tasks = tasks.filter((task) => {
          const taskCompany = String(task.companyName || '').toLowerCase().trim();
          return taskCompany === userCompanyName;
        });
      }

      res.json(tasks || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const task = await Task.findById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Not found' });
      res.json(task);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async create(req, res) {
    try {
      const data = req.body || {};
      if (!data.title) return res.status(400).json({ error: 'title is required' });

      const companyName = req.user?.companyName || '';
      const userId = req.user?.userId || '';
      const createdBy = {
        id: req.user?.userId,
        name: req.user?.name,
        email: req.user?.email
      };

      const payload = buildTaskPayload(data, companyName);
      payload.userId = userId;
      payload.createdBy = createdBy;

      const created = await Task.create(payload);
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const data = req.body || {};
      if (!data.title) return res.status(400).json({ error: 'title is required' });

      const companyName = req.user?.companyName || '';
      const updated = await Task.findByIdAndUpdate(
        req.params.id,
        buildTaskPayload(data, companyName),
        { new: true, runValidators: true }
      );

      if (!updated) return res.status(404).json({ error: 'Not found' });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async updateStatus(req, res) {
    try {
      const { status } = req.body;
      if (!['upcoming', 'overdue', 'completed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const updated = await Task.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      );

      if (!updated) return res.status(404).json({ error: 'Not found' });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async toggleChecklistItem(req, res) {
    try {
      const { itemId, completed } = req.body;
      const task = await Task.findById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Not found' });

      const item = task.checklist.find(i => i.id === itemId);
      if (!item) return res.status(404).json({ error: 'Checklist item not found' });

      item.completed = completed;
      await task.save();
      res.json(task);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async addChecklistItem(req, res) {
    try {
      const { title } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });

      const task = await Task.findById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Not found' });

      task.checklist.push({
        id: new (require('mongoose')).Types.ObjectId().toString(),
        title,
        completed: false
      });

      await task.save();
      res.json(task);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async removeChecklistItem(req, res) {
    try {
      const { itemId } = req.body;
      const task = await Task.findById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Not found' });

      task.checklist = task.checklist.filter(i => i.id !== itemId);
      await task.save();
      res.json(task);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async delete(req, res) {
    try {
      const deleted = await Task.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
};
