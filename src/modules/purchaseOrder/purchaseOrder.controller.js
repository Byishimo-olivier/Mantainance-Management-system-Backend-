const { PurchaseOrder, computeTotal, generatePoNumber } = require('./purchaseOrder.model');
const Vendor = require('../vendor/vendor.model');

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
  return po;
};

async function list(req, res) {
  try {
    const orders = await PurchaseOrder.find().sort({ createdAt: -1 }).populate('vendorId').lean();
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

async function create(req, res) {
  try {
    const data = req.body || {};
    const items = normalizeItems(data.items || data.lines || []);
    const vendorId = data.vendorId || data.vendor_id || null;
    let vendorName = data.vendor || data.vendorName || '';
    if (vendorId && !vendorName) {
      const v = await Vendor.findById(vendorId).lean();
      vendorName = v?.name || vendorName;
    }
    const po = await PurchaseOrder.create({
      title: data.title || data.name || 'Purchase Order',
      poNumber: data.poNumber || data.number || generatePoNumber(),
      status: data.status || 'Draft',
      items,
      totalCost: data.totalCost || computeTotal(items),
      currency: data.currency || 'USD',
      vendorId,
      vendor: vendorName,
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
      createdBy: buildCreatedBy(req, data)
    });
    const enriched = await attachVendorInfo(po);
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
    if (vendorId && !vendorName) {
      const v = await Vendor.findById(vendorId).lean();
      vendorName = v?.name || vendorName;
    }

    existing.title = data.title || data.name || existing.title;
    existing.poNumber = data.poNumber || data.number || existing.poNumber || generatePoNumber();
    existing.status = data.status || existing.status;
    existing.items = items;
    existing.totalCost = data.totalCost || computeTotal(items);
    existing.currency = data.currency || existing.currency;
    existing.vendorId = vendorId;
    existing.vendor = vendorName;
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
    if (data.createdBy) existing.createdBy = data.createdBy;

    await existing.save();
    const enriched = await attachVendorInfo(existing);
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

module.exports = { list, getOne, create, update, remove };
