const service = require('./privateNote.service');

exports.getMine = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const scope = String(req.query.scope || '').trim();
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!scope) {
      return res.status(400).json({ error: 'scope is required' });
    }
    const note = await service.getMyNote(userId, scope);
    res.json(note || { userId, scope, content: '' });
  } catch (err) {
    console.error('[privateNote.getMine]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.upsertMine = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const scope = String(req.body?.scope || '').trim();
    const content = req.body?.content || '';
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!scope) {
      return res.status(400).json({ error: 'scope is required' });
    }
    const note = await service.upsertMyNote(userId, scope, content);
    res.json(note);
  } catch (err) {
    console.error('[privateNote.upsertMine]', err);
    res.status(500).json({ error: err.message });
  }
};
