const service = require('./team.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

exports.getAll = async (req, res) => {
  try {
    const items = await service.findAll();
    res.json(normalizeExtendedJSON(items));
  } catch (err) {
    console.error('[team.getAll]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const item = await service.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(normalizeExtendedJSON(item));
  } catch (err) {
    console.error('[team.getById]', err);
    res.status(500).json({ error: err.message });
  }
};

// Accepts multipart/form-data with optional file field 'image'
exports.create = async (req, res) => {
  try {
    const payload = req.body || {};
    // parse members if provided as JSON string (from multipart/form-data)
    if (payload.members && typeof payload.members === 'string') {
      try {
        payload.members = JSON.parse(payload.members);
      } catch (e) {
        // fallback: comma-separated
        payload.members = payload.members.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
        // handle multipart files: req.files may contain 'image' and 'files'
        if (req.files) {
          if (req.files.image && req.files.image.length > 0) {
            const f = req.files.image[0];
            payload.image = f.path || (`uploads/` + f.filename);
          }
          if (req.files.files && req.files.files.length > 0) {
            payload.files = req.files.files.map(f => f.path || (`uploads/` + f.filename));
          }
          // If members weren't provided manually, attempt to extract them from uploaded files
          try {
            const extractor = require('../../utils/extractMembersFromFiles');
            if ((!payload.members || payload.members.length === 0) && payload.files && payload.files.length > 0) {
              // extractor returns array of {name, email}
              const extracted = await extractor.extractMembersFromFiles(payload.files);
              if (extracted && extracted.length > 0) {
                // set members to extracted list (only add if not provided manually)
                payload.members = extracted;
              }
            }
          } catch (e) {
            console.warn('[team.create] member extraction failed or extractor not installed', e && e.message);
          }
        }
    const created = await service.create(payload);
    res.status(201).json(normalizeExtendedJSON(created));
  } catch (err) {
    console.error('[team.create]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const payload = req.body || {};
    if (payload.members && typeof payload.members === 'string') {
      try { payload.members = JSON.parse(payload.members); } catch (e) { payload.members = payload.members.split(',').map(s => s.trim()).filter(Boolean); }
    }
    if (req.files) {
      if (req.files.image && req.files.image.length > 0) {
        const f = req.files.image[0];
        payload.image = f.path || (`uploads/` + f.filename);
      }
      if (req.files.files && req.files.files.length > 0) {
        payload.files = req.files.files.map(f => f.path || (`uploads/` + f.filename));
      }
      // extraction on update: only run if client didn't supply explicit members
      try {
        const extractor = require('../../utils/extractMembersFromFiles');
        if ((!payload.members || payload.members.length === 0) && payload.files && payload.files.length > 0) {
          const extracted = await extractor.extractMembersFromFiles(payload.files);
          if (extracted && extracted.length > 0) {
            payload.members = extracted;
          }
        }
      } catch (e) {
        console.warn('[team.update] member extraction failed or extractor not installed', e && e.message);
      }
    }
    const updated = await service.update(req.params.id, payload);
    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[team.update]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const result = await service.delete(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[team.delete]', err);
    res.status(500).json({ error: err.message });
  }
};
