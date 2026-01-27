const model = require('./maintenanceSchedule.model');

module.exports = {
  async create(req, res) {
    try {
      const data = { ...req.body };
      if (data.nextDate) data.nextDate = new Date(data.nextDate);
      const schedule = await model.create(data);
      res.status(201).json(schedule);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
  async getAll(req, res) {
    try {
      const schedules = await model.findAll();
      res.json(schedules);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async getById(req, res) {
    try {
      const schedule = await model.findById(req.params.id);
      if (!schedule) return res.status(404).json({ error: 'Not found' });
      res.json(schedule);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async update(req, res) {
    try {
      const data = { ...req.body };
      if (data.nextDate) data.nextDate = new Date(data.nextDate);
      const schedule = await model.update(req.params.id, data);
      res.json(schedule);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
  async remove(req, res) {
    try {
      await model.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};