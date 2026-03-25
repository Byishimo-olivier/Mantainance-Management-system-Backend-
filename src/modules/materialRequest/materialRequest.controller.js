const service = require('./materialRequest.service');
const notificationService = require('../notification/notification.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sendJson = (res, data, status = 200) => res.status(status).json(data);

const getCompanyUserIds = async (companyName) => {
  if (!companyName) return [];
  try {
    const userService = require('../user/user.service');
    const users = await userService.getAllUsers({ companyName });
    return users.map((u) => String(u.id || u._id || u.userId || '')).filter(Boolean);
  } catch (err) {
    console.error('[materialRequest] Failed to resolve company users:', err);
    return [];
  }
};

const isCompanyMaterialRequest = (item, companyUserIds = []) => {
  const linkedIds = [
    item?.clientId,
    item?.technicianId,
    item?.approvedBy,
    item?.requestedBy,
    item?.userId
  ].map((value) => String(value || '')).filter(Boolean);
  return linkedIds.some((id) => companyUserIds.includes(id));
};

async function getAll(req, res) {
  try {
    // Support optional ?clientId= query for client-side fetching
    if (req.query.clientId && !req.user?.companyName) {
      const items = await service.getByClient(req.query.clientId);
      return sendJson(res, items.map(enrichRequest));
    }
    const user = req.user;
    if (user?.companyName) {
      const allItems = await service.getAll();
      const companyUserIds = await getCompanyUserIds(user.companyName);
      const items = allItems.filter((item) => isCompanyMaterialRequest(item, companyUserIds));
      return sendJson(res, items.map(enrichRequest));
    }
    if (user && (user.role === 'client' || user.role === 'requestor')) {
      const items = await service.getByClient(user.userId);
      return sendJson(res, items.map(enrichRequest));
    }
    const items = await service.getAll();
    return sendJson(res, items.map(enrichRequest));
  } catch (err) {
    console.error('[materialRequest.getAll]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getByTechnician(req, res) {
  try {
    const { techId } = req.params;
    const user = req.user;
    if (user?.companyName) {
      const companyUserIds = await getCompanyUserIds(user.companyName);
      const allItems = await service.getAll();
      const scopedItems = allItems.filter((item) => (
        String(item.technicianId || '') === String(techId || '') ||
        isCompanyMaterialRequest(item, companyUserIds)
      ));
      return sendJson(res, scopedItems.map(enrichRequest));
    }
    const items = await service.getByTechnician(techId);
    return sendJson(res, items.map(enrichRequest));
  } catch (err) {
    console.error('[materialRequest.getByTechnician]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function create(req, res) {
  try {
    const payload = req.body || {};
    const user = req.user || {};
    const generatedRequestId = `MR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const createData = {
      technicianId: payload.technicianId || payload.techId || user.userId || '',
      requestId: payload.requestId || generatedRequestId,
      status: payload.status || 'PENDING',
      description: payload.description || null,
      urgency: payload.urgency || null,
      technicianName: payload.technicianName || user.name || null,
      issueId: payload.issueId || null,
      clientId: payload.clientId || user.userId || null,
    };

    if (!createData.clientId && createData.technicianId) {
      createData.clientId = createData.technicianId;
    }

    // Notify all managers/admins about new material request
    notificationService.notifyAdmins({
      title: '📦 New Material Request',
      message: `${createData.technicianName || 'A technician'} submitted a material request: ${payload.title || 'New request'}`,
      type: 'info',
      link: '/manager/material-requests'
    }).catch(() => { }); // fire-and-forget

    if (payload.title || payload.items || payload.quantity) {
      const items = [];
      if (payload.items && Array.isArray(payload.items)) {
        items.push(...payload.items.map(i => ({ materialId: i.materialId, quantity: i.quantity })));
      } else {
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

async function forwardToClient(req, res) {
  try {
    const { id } = req.params;
    const { clientEmail, issueId } = req.body;

    if (!clientEmail) {
      return res.status(400).json({ error: 'clientEmail is required to forward a request' });
    }

    // Resolve client ID from email
    const trimmedEmail = clientEmail.trim();
    const client = await prisma.user.findFirst({
      where: {
        email: {
          equals: trimmedEmail,
          mode: 'insensitive'
        }
      },
      select: { id: true }
    });

    if (!client) {
      return res.status(404).json({ error: `No user found with email: ${trimmedEmail}` });
    }

    const clientId = client.id;
    const updated = await service.forwardToClient(id, clientId, issueId);

    // Look up the original request to get technician name and material title for the notification
    const original = await service.getById(id);
    const itemTitle = (original?.items?.[0]?.materialId) || 'materials';

    // Notify the client
    try {
      await notificationService.createNotification({
        userId: clientId,
        title: '📦 Material Request Requires Your Approval',
        message: `A technician has requested ${itemTitle}. Please review and approve or decline this request.`,
        type: 'info',
        link: '/client/material-requests'
      });
    } catch (notifErr) {
      console.warn('[forwardToClient] notification failed:', notifErr.message);
    }

    return sendJson(res, enrichRequest(updated));
  } catch (err) {
    console.error('[materialRequest.forwardToClient]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function clientRespond(req, res) {
  try {
    const { id } = req.params;
    const { response } = req.body; // 'APPROVED' | 'DECLINED'

    if (!['APPROVED', 'DECLINED'].includes(response)) {
      return res.status(400).json({ error: 'response must be APPROVED or DECLINED' });
    }

    const updated = await service.clientRespond(id, response);

    // Notify managers/admins of the client's decision
    notificationService.notifyAdmins({
      title: `📦 Material Request ${response}`,
      message: `A client has ${response.toLowerCase()} a material request.`,
      type: response === 'APPROVED' ? 'success' : 'warning',
      link: '/manager/material-requests'
    }).catch(() => { });

    return sendJson(res, enrichRequest(updated));
  } catch (err) {
    console.error('[materialRequest.clientRespond]', err);
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

module.exports = { getAll, getByTechnician, create, forwardToClient, clientRespond, update, remove };



