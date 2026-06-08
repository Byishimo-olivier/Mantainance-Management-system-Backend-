const service = require('./materialRequest.service');
const notificationService = require('../notification/notification.service');
const { PurchaseOrder, computeTotal } = require('../purchaseOrder/purchaseOrder.model');
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
        items.push(...payload.items
          .map(i => ({
            materialId: String(i.materialId || i.partId || i.title || '').trim(),
            quantity: Math.max(1, Number(i.quantity) || 1),
            unitOfMeasurement: String(i.unitOfMeasurement || i.unit || i.uom || '').trim() || null,
            unitCost: Number(i.unitCost ?? i.cost ?? i.price ?? 0) || 0,
            amount: Number(i.amount ?? ((Number(i.quantity) || 1) * (Number(i.unitCost ?? i.cost ?? i.price ?? 0) || 0))) || 0
          }))
          .filter(i => i.materialId));
      } else {
        const title = String(payload.title || '').trim();
        if (title) {
          const quantity = Math.max(1, Number(payload.quantity) || 1);
          const unitCost = Number(payload.unitCost ?? payload.cost ?? payload.price ?? 0) || 0;
          items.push({
            title,
            quantity,
            unitOfMeasurement: String(payload.unitOfMeasurement || payload.unit || payload.uom || '').trim() || null,
            unitCost,
            amount: Number(payload.amount ?? (quantity * unitCost)) || 0
          });
        }
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
    unitOfMeasurement: it.unitOfMeasurement || it.unit || it.uom || '',
    unitCost: Number(it.unitCost ?? it.cost ?? it.price ?? 0) || 0,
    amount: Number(it.amount ?? ((Number(it.quantity) || 0) * (Number(it.unitCost ?? it.cost ?? it.price ?? 0) || 0))) || 0,
    title: it.title || it.materialId || ''
  }));
  return out;
}

const buildPurchaseOrderItemsFromStock = (stockItems = [], includeAll = false) => (
  (Array.isArray(stockItems) ? stockItems : [])
    .filter((item) => includeAll || item?.needsPurchase)
    .map((item) => ({
      name: item.materialName || item.materialId || 'Material',
      quantity: Math.max(1, Number((item.needsPurchase ? item.shortage : item.quantityNeeded) || item.quantityNeeded || 1)),
      unitOfMeasurement: item.unitOfMeasurement || item.unit || item.uom || '',
      unitCost: Number(item.unitCost || 0),
      partId: /^[a-f\d]{24}$/i.test(String(item.partId || '')) ? item.partId : undefined,
      notes: `Raised from approved material request. Needed ${Number(item.quantityNeeded || 1)}, available ${Number(item.availableStock || 0)}.`
    }))
);

async function ensureProcurementPurchaseOrder(materialRequest, stockCheck, req) {
  const materialRequestId = String(materialRequest?.id || '');
  if (!materialRequestId) return null;

  const existing = await PurchaseOrder.findOne({
    materialRequestId,
    source: { $in: ['MATERIAL_REQUEST_APPROVAL', 'MATERIAL_REQUEST_SHORTAGE', 'MATERIAL_REQUEST_AUTO_APPROVAL'] }
  }).lean();

  if (existing) return existing;

  const items = buildPurchaseOrderItemsFromStock(stockCheck?.items, !stockCheck?.requiresPO);
  if (items.length === 0) return null;

  const po = await PurchaseOrder.create({
    title: `Material Request ${materialRequest.requestId || materialRequestId.slice(-6)} Procurement`,
    status: 'PROCUREMENT_PENDING',
    items,
    totalCost: computeTotal(items),
    currency: 'RWF',
    materialRequestId,
    issueId: materialRequest.issueId || '',
    workOrderId: materialRequest.workOrderId || materialRequest.issueId || '',
    source: 'MATERIAL_REQUEST_APPROVAL',
    category: 'Material Request',
    notes: 'Created from an approved material request. Procurement should select a vendor, review quantities and costs, then send the purchase order.',
    requisitioner: materialRequest.technicianName || req.user?.name || '',
    companyName: req.user?.companyName || '',
    createdBy: {
      id: req.user?.userId,
      role: req.user?.role,
      name: req.user?.name,
      email: req.user?.email
    }
  });

  const shortageSummary = stockCheck.items
    .filter((item) => !stockCheck.requiresPO || item?.needsPurchase)
    .map((item) => `${item.materialName || item.materialId || 'Material'} (needed ${Number(item.quantityNeeded || 1)}, available ${Number(item.availableStock || 0)})`)
    .join(', ');

  await service.update(materialRequestId, {
    status: 'PROCUREMENT_PENDING',
    description: `${materialRequest.description || ''}${materialRequest.description ? '\n\n' : ''}Approved. Procurement purchase order ${po.poNumber} created for: ${shortageSummary}.`
  });

  return po.toObject ? po.toObject() : po;
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

/**
 * Approve material request with automatic stock checking and PO generation
 * If stock is low, returns PO data that should be used to create a purchase order
 * GET /api/material-requests/:id/approve-with-stock-check
 */
async function approveWithStockCheck(req, res) {
  try {
    const { id } = req.params;
    const { note } = req.body || {};

    const targetRequest = await service.getById(id);
    if (!targetRequest) {
      return res.status(404).json({ error: 'Material request not found' });
    }

    // Approve the request
    const updated = await service.clientRespond(id, 'APPROVED');

    // Add approval note if provided
    if (note) {
      await service.update(id, {
        description: `${targetRequest.description || ''}${targetRequest.description ? '\n\n' : ''}Admin approval note: ${note}`,
      });
    }

    // Check stock requirements
    const autoPOService = require('./materialRequest.autoPO.service');
    const stockCheck = await autoPOService.checkStockRequirement(id, {
      companyName: req.user?.companyName || ''
    });
    const purchaseOrder = await ensureProcurementPurchaseOrder(targetRequest, stockCheck, req);

    // Enrich the response
    const enriched = enrichRequest(updated);

    return sendJson(res, {
      success: true,
      materialRequest: enriched,
      stockAnalysis: stockCheck,
      requiresPO: stockCheck.requiresPO,
      purchaseOrder,
      message: purchaseOrder
        ? 'Material request approved. A procurement purchase order was created.'
        : stockCheck.requiresPO
          ? 'Material request approved. Stock is insufficient - a purchase order is required.'
          : 'Material request approved. Sufficient stock is available.'
    });
  } catch (err) {
    console.error('[materialRequest.approveWithStockCheck]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get PO generation data for a material request
 * This prepares the data needed to create a purchase order
 * GET /api/material-requests/:id/generate-po-data
 */
async function generatePOData(req, res) {
  try {
    const { id } = req.params;
    const { vendorId, vendorName, vendorEmail } = req.body || {};

    const request = await service.getById(id);
    if (!request) {
      return res.status(404).json({ error: 'Material request not found' });
    }

    const autoPOService = require('./materialRequest.autoPO.service');
    const poData = await autoPOService.autogeneratePOForApprovedRequest(id, {
      companyName: req.user?.companyName || '',
      vendorId,
      vendorName,
      vendorEmail
    });

    return sendJson(res, poData);
  } catch (err) {
    console.error('[materialRequest.generatePOData]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getAll, getByTechnician, create, forwardToClient, clientRespond, update, remove, approveWithStockCheck, generatePOData };



