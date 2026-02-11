const service = require('./materialRequest.service');

const sendJson = (res, data, status = 200) => res.status(status).json(data);

async function getAll(req, res) {
  try {
    const items = await service.getAll();
    const enriched = items.map(enrichRequest);
    return sendJson(res, enriched);
  } catch (err) {
    console.error('[materialRequest.getAll]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getByTechnician(req, res) {
  try {
    const { techId } = req.params;
    const items = await service.getByTechnician(techId);
    const enriched = items.map(enrichRequest);
    return sendJson(res, enriched);
  } catch (err) {
    console.error('[materialRequest.getByTechnician]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function create(req, res) {
  try {
    const payload = req.body || {};
    const generatedRequestId = `MR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const createData = {
      technicianId: payload.technicianId || payload.techId || '',
      requestId: payload.requestId || generatedRequestId,
      status: payload.status || 'PENDING'
    };

    // If frontend provided item-like fields, create request + items
    if (payload.title || payload.items || payload.quantity) {
      const items = [];
      if (payload.items && Array.isArray(payload.items)) {
        items.push(...payload.items.map(i => ({ materialId: i.materialId, quantity: i.quantity })));
      } else {
        // single-item payload
        items.push({ title: payload.title, quantity: payload.quantity || 1 });
      }
      const created = await service.createWithItems(createData, items);
      return sendJson(res, enrichRequest(created), 201);
    }

    const created = await service.create(createData);
    return sendJson(res, enrichRequest(created), 201);
  } catch (err) {
    console.error('[materialRequest.create]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function enrichRequest(r) {
  if (!r) return r;
  const out = { ...r };
  const items = out.items || [];
  out.items = items.map(it => ({
    id: it.id,
    materialId: it.materialId,
    quantity: it.quantity,
    // expose a friendly title for the frontend
    title: it.title || it.materialId || ''
  }));
  return out;
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const payload = req.body;
    const updated = await service.update(id, payload);
    return sendJson(res, updated);
  } catch (err) {
    console.error('[materialRequest.update]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function remove(req, res) {
  try {
    const { id } = req.params;
    await service.delete(id);
    return res.status(204).send();
  } catch (err) {
    console.error('[materialRequest.delete]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getAll, getByTechnician, create, update, remove };
