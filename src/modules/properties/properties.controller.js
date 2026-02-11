const service = require('./properties.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

exports.getAll = async (req, res) => {
  try {
    // Only return properties owned by the logged-in user
    const user = req.user;
    if (!user || !user.id) {
      return res.status(401).json({ error: 'User not authenticated.' });
    }
    const properties = await service.findAll({ userId: user.id });
    res.json(normalizeExtendedJSON(properties));
  } catch (err) {
    console.error('[properties.controller.js:getAll]', err);
    if (err instanceof Error && err.stack) {
      console.error('Stack trace:', err.stack);
    }
    res.status(500).json({ error: err.message, details: err.stack });
  }
};

exports.getById = async (req, res) => {
  if (!req.params || !req.params.id) {
    return res.status(400).json({ error: 'Missing property id' });
  }
  try {
    const property = await service.findById(req.params.id);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    res.json(normalizeExtendedJSON(property));
  } catch (err) {
    console.error('[properties.controller.js:getById]', err);
    if (String(err.message).toLowerCase().includes('invalid objectid')) {
      return res.status(400).json({ error: 'Invalid property id' });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    // Use userId from authenticated user (req.user)
    const user = req.user;
    if (!user || !user.id) {
      return res.status(401).json({ error: 'User not authenticated.' });
    }
    const data = { ...req.body, userId: user.id };
    const property = await service.create(data);
    res.status(201).json(normalizeExtendedJSON(property));
  } catch (err) {
    console.error('[properties.controller.js:create]', err);
    res.status(400).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  if (!req.params || !req.params.id) {
    return res.status(400).json({ error: 'Missing property id' });
  }
  try {
    const property = await service.update(req.params.id, req.body);
    res.json(normalizeExtendedJSON(property));
  } catch (err) {
    console.error('[properties.controller.js:update]', err);
    if (String(err.message).toLowerCase().includes('invalid objectid')) {
      return res.status(400).json({ error: 'Invalid property id' });
    }
    res.status(400).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  if (!req.params || !req.params.id) {
    return res.status(400).json({ error: 'Missing property id' });
  }
  try {
    await service.delete(req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('[properties.controller.js:delete]', err);
    if (String(err.message).toLowerCase().includes('invalid objectid')) {
      return res.status(400).json({ error: 'Invalid property id' });
    }
    res.status(500).json({ error: err.message });
  }
};