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
    // Resolve member ids to People/User objects when possible
    try {
      if (item.members && Array.isArray(item.members) && item.members.length > 0) {
        const peopleService = require('../people/people.service');
        const userService = require('../user/user.service');
        const techService = require('../technician/technician.service');
        const resolved = await Promise.all(item.members.map(async (m) => {
          if (!m && m !== 0) return m;
          if (typeof m === 'object') return m;
          const raw = String(m).trim();
          // try parse JSON blob
          if ((raw.startsWith('{') || raw.startsWith('['))) {
            try { return JSON.parse(raw); } catch (e) { /* ignore */ }
          }
          // try people collection
          try {
            const p = await peopleService.findById(raw).catch(() => null);
            if (p) return { id: p.id || p._id || String(p._id), name: p.name || p.fullName || p.email, email: p.email };
          } catch (e) { }
          // try users collection
          try {
            const u = await userService.findUserById(raw).catch(() => null);
            if (u) return { id: u.id || u._id || String(u._id), name: u.name || u.username || u.email, email: u.email };
          } catch (e) { }
          // try external technicians collection
          try {
            const t = await techService.getById(raw).catch(() => null);
            if (t) return { id: t.id || t._id || String(t._id), name: t.name || t.email, email: t.email };
          } catch (e) { }
          return raw;
        }));
        item.members = resolved;
      }
    } catch (e) {
      console.warn('[team.getById] failed to resolve members', e && e.message);
    }
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

    // Notify team members
    try {
      if (payload.members && Array.isArray(payload.members)) {
        const emailService = require('../emailService/email.service');
        const techService = require('../technician/technician.service');
        const userService = require('../user/user.service');

        for (const memberId of payload.members) {
          let email = null;
          let name = null;

          // Try resolving member info
          // (assuming memberId might be an ID string or an object with email)
          if (typeof memberId === 'object') {
            email = memberId.email;
            name = memberId.name;
          } else {
            const rawId = String(memberId).trim();
            // try external tech
            const t = await techService.getById(rawId).catch(() => null);
            if (t) { email = t.email; name = t.name; }
            else {
              // try internal user
              const u = await userService.findUserById(rawId).catch(() => null);
              if (u) { email = u.email; name = u.name; }
            }
          }

          if (email) {
            await emailService.sendTechnicianWelcome({
              email,
              name: name || 'Team Member',
              teamName: created.name
            }).catch(e => console.error('Failed to notify team member:', email, e.message));
          }
        }
      }
    } catch (notifyErr) {
      console.error('Error during team member notification:', notifyErr);
    }

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
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[team.update]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const result = await service.delete(req.params.id);
    if (!result || result.success === false) return res.status(404).json({ error: result && result.error ? result.error : 'Not found' });
    res.json(result);
  } catch (err) {
    console.error('[team.delete]', err);
    res.status(500).json({ error: err.message });
  }
};
