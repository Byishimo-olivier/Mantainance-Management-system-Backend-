const { PurchaseOrder, computeTotal, generatePoNumber } = require('./purchaseOrder.model');
const Vendor = require('../vendor/vendor.model');
const emailService = require('../emailService/email.service');
const smsService = require('../sms/sms.service');
const materialRequestService = require('../materialRequest/materialRequest.service');
const issueService = require('../issue/issue.service');
const notificationService = require('../notification/notification.service');
const userService = require('../user/user.service');

const getFrontendOrigin = () => process.env.FRONTEND_URL || 'http://localhost:5173';
const buildPublicPoLink = (publicToken) => `${getFrontendOrigin()}/public-purchase-order/${publicToken}`;
const compactForSms = (value, max = 120) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
};
const collectPhoneNumbers = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [values])
    .map((value) => {
      if (!value) return '';
      if (typeof value === 'string') return value;
      return value.phone || '';
    })
    .map((value) => String(value || '').trim())
    .filter(Boolean)
));

const normalizeItems = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items
    .filter(i => i && (i.name || i.partName || i.title))
    .map(i => ({
      name: i.name || i.partName || i.title || 'Item',
      quantity: Number(i.quantity || i.qty || 1),
      unitCost: Number(i.unitCost || i.cost || i.price || 0),
      partId: i.partId || i.part || i.part_id || undefined,
      notes: i.notes || ''
    }));
};

const buildCreatedBy = (req, payload = {}) => {
  if (req.user) {
    return {
      id: req.user.userId,
      role: req.user.role,
      name: payload.createdBy?.name,
      email: payload.createdBy?.email
    };
  }
  return payload.createdBy || null;
};

const attachVendorInfo = async (doc) => {
  if (!doc) return doc;
  const po = doc.toObject ? doc.toObject() : doc;
  if (po.vendorId && !po.vendor) {
    try {
      const v = await Vendor.findById(po.vendorId).lean();
      if (v) {
        po.vendor = v.name;
        po.vendorDetails = { _id: v._id, name: v.name, email: v.email, phone: v.phone, type: v.type };
      }
    } catch (_) {
      /* ignore vendor lookup errors */
    }
  }
  if (po.publicToken) {
    po.publicLink = buildPublicPoLink(po.publicToken);
  }
  return po;
};

const sendVendorPurchaseOrderEmail = async (poDoc, explicitVendorEmail = '', explicitVendorPhone = '') => {
  const enriched = await attachVendorInfo(poDoc);
  const vendorEmail = String(
    explicitVendorEmail
    || enriched?.vendorDetails?.email
    || enriched?.vendorId?.email
    || ''
  ).trim();
  const vendorPhone = String(
    explicitVendorPhone
    || enriched?.vendorDetails?.phone
    || enriched?.vendorId?.phone
    || ''
  ).trim();

  const itemsHtml = (Array.isArray(enriched?.items) ? enriched.items : []).map((item) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${item.name || 'Item'}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${Number(item.quantity || 0)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${Number(item.unitCost || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  if (vendorEmail) {
    await emailService.sendEmail({
    to: vendorEmail,
    subject: `Purchase Order ${enriched.poNumber} from ${enriched.companyName || 'your customer'}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #111827;">
        <h2 style="color: #2563eb;">Purchase Order Ready</h2>
        <p>Hello ${enriched?.vendorDetails?.name || enriched?.vendor || 'Vendor'},</p>
        <p>A purchase order has been prepared for you.</p>
        <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0;">
          <p><strong>PO Number:</strong> ${enriched.poNumber}</p>
          <p><strong>Title:</strong> ${enriched.title}</p>
          <p><strong>Company:</strong> ${enriched.companyName || '—'}</p>
          <p><strong>Status:</strong> ${enriched.status || 'Draft'}</p>
          <p><strong>Expected Date:</strong> ${enriched.expectedDate ? new Date(enriched.expectedDate).toLocaleDateString() : '—'}</p>
          <p><strong>Public Link:</strong> <a href="${enriched.publicLink}">${enriched.publicLink}</a></p>
        </div>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <thead>
            <tr style="background:#eff6ff;">
              <th style="text-align:left;padding:8px;">Item</th>
              <th style="text-align:left;padding:8px;">Qty</th>
              <th style="text-align:left;padding:8px;">Unit Cost</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <p>You can open the public link above to review the purchase order without signing in.</p>
      </div>
    `,
    });
  }

  if (vendorPhone) {
    try {
      await smsService.sendSms({
        to: vendorPhone,
        body: `Purchase order ${enriched.poNumber} from ${enriched.companyName || 'your customer'} is ready. ${compactForSms(enriched.title, 50)}. Review: ${enriched.publicLink}`,
      });
    } catch (smsError) {
      console.error('Error sending vendor purchase order SMS:', smsError);
    }
  }

  return enriched;
};

const notifyCompanyPurchaseOrderResponse = async (poDoc, response, note = '') => {
  const enriched = await attachVendorInfo(poDoc);
  const companyName = String(enriched?.companyName || '').trim();
  if (!companyName) return enriched;

  const recipients = await userService.getUsersByRoles(['admin', 'manager'], {
    companyName,
    status: 'active',
  });

  if (!Array.isArray(recipients) || recipients.length === 0) return enriched;

  const responseLabel = response === 'APPROVED' ? 'approved' : 'declined';
  const dashboardUrl = `${getFrontendOrigin()}/manager-dashboard`;
  const poLink = enriched?.publicLink || dashboardUrl;
  const recipientEmails = recipients
    .map((user) => String(user?.email || '').trim())
    .filter(Boolean);
  const recipientPhones = collectPhoneNumbers(recipients);

  await Promise.all(recipients.map(async (recipient) => {
    try {
      await notificationService.createNotification({
        userId: String(recipient._id || recipient.id || ''),
        title: `Purchase Order ${response === 'APPROVED' ? 'Approved' : 'Declined'}`,
        message: `${enriched?.vendorDetails?.name || enriched?.vendor || 'Vendor'} ${responseLabel} purchase order ${enriched?.poNumber || ''}.`,
        type: response === 'APPROVED' ? 'success' : 'warning',
        link: '/manager-dashboard',
      });
    } catch (_) {
      /* ignore per-user notification failures */
    }
  }));

  if (recipientEmails.length > 0) {
    const itemsHtml = (Array.isArray(enriched?.items) ? enriched.items : []).map((item) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${item.name || 'Item'}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${Number(item.quantity || 0)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${Number(item.unitCost || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    await emailService.sendEmail({
      to: recipientEmails.join(','),
      subject: `Vendor ${response === 'APPROVED' ? 'approved' : 'declined'} PO ${enriched?.poNumber || ''}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #111827;">
          <h2 style="color: ${response === 'APPROVED' ? '#059669' : '#dc2626'};">Purchase Order ${response === 'APPROVED' ? 'Approved' : 'Declined'} by Vendor</h2>
          <p>The vendor <strong>${enriched?.vendorDetails?.name || enriched?.vendor || 'Vendor'}</strong> has ${responseLabel} purchase order <strong>${enriched?.poNumber || ''}</strong> for <strong>${companyName}</strong>.</p>
          <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0;">
            <p><strong>PO Number:</strong> ${enriched?.poNumber || '—'}</p>
            <p><strong>Title:</strong> ${enriched?.title || 'Purchase Order'}</p>
            <p><strong>Status:</strong> ${enriched?.status || response}</p>
            <p><strong>Vendor:</strong> ${enriched?.vendorDetails?.name || enriched?.vendor || '—'}</p>
            <p><strong>Total Cost:</strong> ${Number(enriched?.totalCost || 0).toFixed(2)} ${enriched?.currency || 'RWF'}</p>
            <p><strong>Public Link:</strong> <a href="${poLink}">${poLink}</a></p>
          </div>
          ${note ? `<p><strong>Vendor note:</strong> ${note}</p>` : ''}
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <thead>
              <tr style="background:#eff6ff;">
                <th style="text-align:left;padding:8px;">Item</th>
                <th style="text-align:left;padding:8px;">Qty</th>
                <th style="text-align:left;padding:8px;">Unit Cost</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <p>Open the dashboard to review the linked work order and material request.</p>
          <p><a href="${dashboardUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;">Open Dashboard</a></p>
        </div>
      `,
    });
  }

  if (recipientPhones.length > 0) {
    try {
      await smsService.sendBulkSms({
        recipients: recipientPhones,
        body: `Vendor ${enriched?.vendorDetails?.name || enriched?.vendor || 'Vendor'} ${responseLabel} PO ${enriched?.poNumber || ''} for ${companyName}. ${note ? `Note: ${compactForSms(note, 70)}. ` : ''}Open: ${poLink}`,
      });
    } catch (smsError) {
      console.error('Error sending purchase order response SMS:', smsError);
    }
  }

  return enriched;
};

async function list(req, res) {
  try {
    let orders = await PurchaseOrder.find().sort({ createdAt: -1 }).populate('vendorId').lean();
    const user = req.user;
    // If no user, return empty array for security
    if (!user) {
      console.warn('[PurchaseOrders.list] No authenticated user. Returning empty array.');
      return res.json([]);
    }
    // Check if user is admin/manager - they see all items
    const isAdmin = ['admin', 'manager', 'superadmin'].includes(user.role);
    if (!isAdmin) {
      // Regular users only see items matching their company
      if (!user.companyName) {
        console.warn('[PurchaseOrders.list] Regular user has no companyName. Returning empty array.');
        return res.json([]);
      }
      const userCompanyName = String(user.companyName || '').toLowerCase().trim();
      orders = orders.filter((order) => {
        const orderCompany = String(order.companyName || order.company || '').toLowerCase().trim();
        return orderCompany === userCompanyName;
      });
    }
    const enriched = orders.map(o => ({
      ...o,
      vendor: o.vendor || o.vendorId?.name || '',
      vendorDetails: o.vendorDetails || (o.vendorId
        ? { _id: o.vendorId._id, name: o.vendorId.name, email: o.vendorId.email, phone: o.vendorId.phone, type: o.vendorId.type }
        : undefined)
    }));
    return res.json(enriched);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getOne(req, res) {
  try {
    const po = await PurchaseOrder.findById(req.params.id).populate('vendorId');
    if (!po) return res.status(404).json({ error: 'Not found' });
    const enriched = await attachVendorInfo(po);
    return res.json(enriched);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

async function getPublicByToken(req, res) {
  try {
    const po = await PurchaseOrder.findOne({ publicToken: req.params.token }).populate('vendorId').lean();
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    const enriched = await attachVendorInfo(po);
    return res.json(enriched);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

async function respondPublic(req, res) {
  try {
    const po = await PurchaseOrder.findOne({ publicToken: req.params.token });
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });

    const response = String(req.body?.response || '').trim().toUpperCase();
    const note = String(req.body?.note || '').trim();
    const items = Array.isArray(req.body?.items) ? normalizeItems(req.body.items) : null;
    if (!['APPROVED', 'DECLINED'].includes(response)) {
      return res.status(400).json({ error: 'response must be APPROVED or DECLINED' });
    }

    if (items && items.length > 0) {
      po.items = items;
      po.totalCost = computeTotal(items);
    }
    po.status = response;
    po.vendorResponse = response;
    po.vendorResponseAt = new Date();
    po.vendorResponseNote = note;
    await po.save();

    let linkedIssueId = po.issueId || po.workOrderId || '';

    if (po.materialRequestId) {
      const existingRequest = await materialRequestService.getById(po.materialRequestId);
      if (existingRequest) {
        linkedIssueId = linkedIssueId || existingRequest.issueId || '';
        const currentDescription = String(existingRequest.description || '').trim();
        const approvalLine = response === 'APPROVED'
          ? `Vendor approved purchase order ${po.poNumber}.${note ? ` Note: ${note}` : ''}`
          : `Vendor declined purchase order ${po.poNumber}.${note ? ` Note: ${note}` : ''}`;
        const mergedDescription = currentDescription
          ? `${currentDescription}\n\n${approvalLine}`
          : approvalLine;

        await materialRequestService.update(po.materialRequestId, {
          status: response === 'APPROVED' ? 'APPROVED' : 'VENDOR_DECLINED',
          clientResponse: response === 'APPROVED' ? 'APPROVED' : 'DECLINED',
          description: mergedDescription,
        });
      }
    }

    if (response === 'APPROVED' && linkedIssueId && Array.isArray(po.items) && po.items.length > 0) {
      await issueService.reconcileParts(linkedIssueId, po.items.map((item) => ({
        name: item?.name || 'Material',
        status: 'Approved',
        cost: Number(item?.unitCost || 0) || 0,
        quantity: Number(item?.quantity || 1) || 1,
        location: '',
        notes: `Approved from vendor purchase order ${po.poNumber}.${note ? ` Vendor note: ${note}` : ''}`,
        source: 'approved',
        inventoryPartId: item?.partId || null,
        approvedAt: new Date().toISOString(),
      })));
    }

    await notifyCompanyPurchaseOrderResponse(po, response, note);

    const enriched = await attachVendorInfo(po);
    return res.json(enriched);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

async function create(req, res) {
  try {
    const data = req.body || {};
    const items = normalizeItems(data.items || data.lines || []);
    const vendorId = data.vendorId || data.vendor_id || null;
    let vendorName = data.vendor || data.vendorName || '';
    let vendorEmail = data.vendorEmail || '';
    let vendorPhone = data.vendorPhone || '';
    if (vendorId && !vendorName) {
      const v = await Vendor.findById(vendorId).lean();
      vendorName = v?.name || vendorName;
      vendorEmail = vendorEmail || v?.email || '';
      vendorPhone = vendorPhone || v?.phone || '';
    }
    const companyName = req.user?.companyName || '';
    const po = await PurchaseOrder.create({
      title: data.title || data.name || 'Purchase Order',
      poNumber: data.poNumber || data.number || generatePoNumber(),
      status: data.status || 'Draft',
      items,
      totalCost: data.totalCost || computeTotal(items),
      currency: data.currency || 'USD',
      vendorId,
      vendor: vendorName,
      materialRequestId: data.materialRequestId || '',
      issueId: data.issueId || '',
      workOrderId: data.workOrderId || '',
      source: data.source || '',
      expectedDate: data.expectedDate || data.deliveryDate,
      purchaseDate: data.purchaseDate || undefined,
      shippingMethod: data.shippingMethod || '',
      terms: data.terms || '',
      fobShippingPoint: data.fobShippingPoint || '',
      category: data.category || '',
      additionalDetails: data.additionalDetails || '',
      requisitioner: data.requisitioner || '',
      billing: {
        companyName: data.billing?.companyName || '',
        address: data.billing?.address || '',
        phone: data.billing?.phone || '',
        fax: data.billing?.fax || ''
      },
      shipping: {
        name: data.shipping?.name || '',
        address: data.shipping?.address || '',
        phone: data.shipping?.phone || ''
      },
      notes: data.notes || data.description || '',
      companyName: data.companyName || companyName,
      createdBy: buildCreatedBy(req, data)
    });
    const enriched = data.sendVendorLink
      ? await sendVendorPurchaseOrderEmail(po, vendorEmail, vendorPhone)
      : await attachVendorInfo(po);
    return res.status(201).json(enriched);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'PO number already exists' });
    }
    return res.status(400).json({ error: err.message });
  }
}

async function update(req, res) {
  try {
    const data = req.body || {};
    let existing = await PurchaseOrder.findById(req.params.id);
    // If no document by ObjectId, try matching by poNumber so PATCH PO-123 works
    if (!existing) {
      existing = await PurchaseOrder.findOne({ poNumber: req.params.id });
    }
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const items = data.items ? normalizeItems(data.items) : existing.items;
    const vendorId = data.vendorId || data.vendor_id || existing.vendorId || null;
    let vendorName = data.vendor || data.vendorName || existing.vendor || '';
    let vendorEmail = data.vendorEmail || existing.vendorDetails?.email || '';
    let vendorPhone = data.vendorPhone || existing.vendorDetails?.phone || '';
    if (vendorId && !vendorName) {
      const v = await Vendor.findById(vendorId).lean();
      vendorName = v?.name || vendorName;
      vendorEmail = vendorEmail || v?.email || '';
      vendorPhone = vendorPhone || v?.phone || '';
    }

    existing.title = data.title || data.name || existing.title;
    existing.poNumber = data.poNumber || data.number || existing.poNumber || generatePoNumber();
    existing.status = data.status || existing.status;
    existing.items = items;
    existing.totalCost = data.totalCost || computeTotal(items);
    existing.currency = data.currency || existing.currency;
    existing.vendorId = vendorId;
    existing.vendor = vendorName;
    existing.materialRequestId = data.materialRequestId ?? existing.materialRequestId;
    existing.issueId = data.issueId ?? existing.issueId;
    existing.workOrderId = data.workOrderId ?? existing.workOrderId;
    existing.source = data.source ?? existing.source;
    existing.expectedDate = data.expectedDate || data.deliveryDate || existing.expectedDate;
    existing.purchaseDate = data.purchaseDate || existing.purchaseDate;
    existing.shippingMethod = data.shippingMethod ?? existing.shippingMethod;
    existing.terms = data.terms ?? existing.terms;
    existing.fobShippingPoint = data.fobShippingPoint ?? existing.fobShippingPoint;
    existing.category = data.category ?? existing.category;
    existing.additionalDetails = data.additionalDetails ?? existing.additionalDetails;
    existing.requisitioner = data.requisitioner ?? existing.requisitioner;
    existing.billing = {
      companyName: data.billing?.companyName ?? existing.billing?.companyName ?? '',
      address: data.billing?.address ?? existing.billing?.address ?? '',
      phone: data.billing?.phone ?? existing.billing?.phone ?? '',
      fax: data.billing?.fax ?? existing.billing?.fax ?? ''
    };
    existing.shipping = {
      name: data.shipping?.name ?? existing.shipping?.name ?? '',
      address: data.shipping?.address ?? existing.shipping?.address ?? '',
      phone: data.shipping?.phone ?? existing.shipping?.phone ?? ''
    };
    existing.notes = data.notes || data.description || existing.notes;
    // Preserve companyName - don't allow clients to change it
    existing.companyName = existing.companyName || req.user?.companyName || '';
    if (data.createdBy) existing.createdBy = data.createdBy;

    await existing.save();
    const enriched = data.sendVendorLink
      ? await sendVendorPurchaseOrderEmail(existing, vendorEmail, vendorPhone)
      : await attachVendorInfo(existing);
    return res.json(enriched);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

async function remove(req, res) {
  try {
    const deleted = await PurchaseOrder.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

module.exports = { list, getOne, getPublicByToken, respondPublic, create, update, remove };
