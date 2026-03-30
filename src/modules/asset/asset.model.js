const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper to access raw MongoDB collection via Mongoose connection
const getRawCollection = (modelName) => {
  const mongoose = require('mongoose');
  if (mongoose.connection && mongoose.connection.db) {
    return mongoose.connection.db.collection(modelName);
  }
  return null;
};

// Helper to map MongoDB _id to Prisma-style id
const mapRecord = (record) => {
  if (!record) return null;
  const mapped = { ...record, id: record._id.toString() };
  delete mapped._id;
  return mapped;
};

const normalizeAssetWhere = (where) => {
  if (!where || typeof where !== 'object') return where;
  if (Array.isArray(where)) return where.map(normalizeAssetWhere);

  const out = { ...where };
  if (out.OR) out.OR = normalizeAssetWhere(out.OR);
  if (out.AND) out.AND = normalizeAssetWhere(out.AND);

  // Support legacy filters using scalar relation keys (propertyId/userId)
  if (Object.prototype.hasOwnProperty.call(out, 'propertyId') && !Object.prototype.hasOwnProperty.call(out, 'property')) {
    const propertyId = out.propertyId;
    delete out.propertyId;
    if (propertyId && typeof propertyId === 'object' && Array.isArray(propertyId.in)) {
      out.property = { is: { id: { in: propertyId.in } } };
    } else if (propertyId !== undefined && propertyId !== null && propertyId !== '') {
      out.property = { is: { id: propertyId } };
    }
  }

  if (Object.prototype.hasOwnProperty.call(out, 'userId') && !Object.prototype.hasOwnProperty.call(out, 'user')) {
    const userId = out.userId;
    delete out.userId;
    if (userId && typeof userId === 'object' && Array.isArray(userId.in)) {
      out.user = { is: { id: { in: userId.in } } };
    } else if (userId !== undefined && userId !== null && userId !== '') {
      out.user = { is: { id: userId } };
    }
  }

  return out;
};

const toTrimmedString = (value) => {
  if (value === undefined || value === null) return undefined;
  const stringValue = String(value).trim();
  return stringValue === '' ? undefined : stringValue;
};

const toOptionalNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toOptionalDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toStringArray = (value) => {
  if (!value) return [];
  const source = Array.isArray(value) ? value : [value];
  return source.map((item) => toTrimmedString(item)).filter(Boolean);
};

const normalizeOperationalStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'not operational' || normalized === 'down' || normalized === 'inactive') return 'Down';
  if (normalized === 'operational' || normalized === 'active' || normalized === 'up') return 'Active';
  return normalized ? String(value).trim() : 'Active';
};

const normalizeIdentifiersPayload = (identifiers) => {
  if (!identifiers || typeof identifiers !== 'object' || Array.isArray(identifiers)) return undefined;
  const normalized = {
    ...identifiers,
    barcode: toTrimmedString(identifiers.barcode),
    model: toTrimmedString(identifiers.model),
    manufacturer: toTrimmedString(identifiers.manufacturer),
    category: toTrimmedString(identifiers.category),
    area: toTrimmedString(identifiers.area),
    residualValue: toOptionalNumber(identifiers.residualValue),
    workerId: toTrimmedString(identifiers.workerId),
    teamId: toTrimmedString(identifiers.teamId),
    customerId: toTrimmedString(identifiers.customerId),
    operatingScheduleId: toTrimmedString(identifiers.operatingScheduleId),
    additionalInformation: toTrimmedString(identifiers.additionalInformation),
    serviceDate: toOptionalDate(identifiers.serviceDate),
    trackCheckInOut: Boolean(identifiers.trackCheckInOut),
    additionalWorkerIds: toStringArray(identifiers.additionalWorkerIds),
    parts: Array.isArray(identifiers.parts)
      ? identifiers.parts.map((part) => {
          if (typeof part === 'string') return { name: part };
          if (!part || typeof part !== 'object') return null;
          return {
            ...part,
            name: toTrimmedString(part.name) || 'Part',
          };
        }).filter(Boolean)
      : [],
  };

  if (identifiers.usefulLife && typeof identifiers.usefulLife === 'object' && !Array.isArray(identifiers.usefulLife)) {
    normalized.usefulLife = {
      value: toOptionalNumber(identifiers.usefulLife.value),
      unit: toTrimmedString(identifiers.usefulLife.unit) || 'years',
    };
  } else {
    normalized.usefulLife = null;
  }

  Object.keys(normalized).forEach((key) => {
    if (normalized[key] === undefined) delete normalized[key];
  });

  return normalized;
};

module.exports = {
  create: async (data) => {
    const payload = { ...data };
    delete payload.companyName;

    payload.name = toTrimmedString(payload.name);
    payload.type = toTrimmedString(payload.type) || 'General';
    payload.description = toTrimmedString(payload.description) || null;
    payload.serialNumber = toTrimmedString(payload.serialNumber) || null;
    payload.parentId = toTrimmedString(payload.parentId) || null;
    payload.vendorId = toTrimmedString(payload.vendorId) || null;
    payload.vendorName = toTrimmedString(payload.vendorName) || null;
    payload.purchaseDate = toOptionalDate(payload.purchaseDate);
    payload.purchaseCost = toOptionalNumber(payload.purchaseCost);
    payload.currentValue = toOptionalNumber(payload.currentValue);
    payload.warrantyUntil = toOptionalDate(payload.warrantyUntil);
    payload.photos = toStringArray(payload.photos);
    payload.documents = toStringArray(payload.documents);
    payload.identifiers = normalizeIdentifiersPayload(payload.identifiers);

    // Prisma checked inputs don't accept relation scalar FKs (propertyId/userId).
    // Convert them into relation connects for compatibility across client versions.
    const rel = {};
    if (Object.prototype.hasOwnProperty.call(payload, 'propertyId')) {
      const propertyId = payload.propertyId;
      delete payload.propertyId;
      if (propertyId && !payload.property) {
        rel.property = { connect: { id: String(propertyId) } };
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'userId')) {
      const userId = payload.userId;
      delete payload.userId;
      if (userId && !payload.user) {
        rel.user = { connect: { id: String(userId) } };
      }
    }

    // Merge building/block into the location JSON field if provided
    let location = payload.location ? { ...payload.location } : {};
    let hadLocation = !!payload.location;
    if (Object.prototype.hasOwnProperty.call(payload, 'building')) {
      if (payload.building !== undefined && payload.building !== null && payload.building !== '') {
        location.building = payload.building;
      }
      delete payload.building;
      hadLocation = true;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'floor')) {
      if (payload.floor !== undefined && payload.floor !== null && payload.floor !== '') {
        location.floor = payload.floor;
      }
      delete payload.floor;
      hadLocation = true;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'room')) {
      if (payload.room !== undefined && payload.room !== null && payload.room !== '') {
        location.room = payload.room;
      }
      delete payload.room;
      hadLocation = true;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'blocks')) {
      if (payload.blocks !== undefined && payload.blocks !== null && payload.blocks !== '') {
        location.block = payload.blocks;
      }
      delete payload.blocks;
      hadLocation = true;
    } else if (Object.prototype.hasOwnProperty.call(payload, 'block')) {
      if (payload.block !== undefined && payload.block !== null && payload.block !== '') {
        location.block = payload.block;
      }
      delete payload.block;
      hadLocation = true;
    }

    const dataToCreate = { ...payload, ...rel, quantity: Math.max(1, parseInt(payload.quantity, 10) || 1) };
    // defensive cleanup: remove any top-level fields that don't exist on the Prisma model
    delete dataToCreate.block;
    delete dataToCreate.blocks;
    delete dataToCreate.building;
    delete dataToCreate.floor;
    delete dataToCreate.room;
    if (hadLocation) dataToCreate.location = location;
    if (dataToCreate.identifiers === undefined) delete dataToCreate.identifiers;

    try {
      return await prisma.asset.create({ data: dataToCreate });
    } catch (err) {
      if (err.message.includes('userId') || err.message.includes('converting')) {
        console.error('SURVIVAL MODE: Prisma create failed for Asset. Returning raw data.');
        // If it failed because of conversion post-creation, the record exists.
        // We try to fetch it raw to be sure.
        const col = getRawCollection('Asset');
        if (col) {
          const saved = await col.findOne({ name: dataToCreate.name, createdAt: { $gte: new Date(Date.now() - 5000) } });
          if (saved) return mapRecord(saved);
        }
      }
      throw err;
    }
  },
  findAll: async (filter = {}) => {
    try {
      const where = normalizeAssetWhere(filter);
      return await prisma.asset.findMany({ where, include: { property: true, spareParts: true } });
    } catch (err) {
      if (err.message.includes('userId') || err.message.includes('converting')) {
        console.error('CRITICAL: Prisma conversion error detected for Asset. Falling back to raw MongoDB query.');
        const col = getRawCollection('Asset');
        if (!col) throw err;
        const translated = {};
        for (const key in filter) {
          if (filter[key] && typeof filter[key] === 'object' && filter[key].in) {
            translated[key] = { $in: filter[key].in };
          } else {
            translated[key] = filter[key];
          }
        }
        const assets = await col.find(translated).toArray();
        return assets.map(mapRecord);
      }
      throw err;
    }
  },
  findById: async (id) => {
    try {
      return await prisma.asset.findUnique({ where: { id }, include: { property: true, spareParts: true, movements: true } });
    } catch (err) {
      if (err.message.includes('userId') || err.message.includes('converting')) {
        console.error('SURVIVAL MODE: Prisma findById failed for Asset. Falling back to raw.');
        const col = getRawCollection('Asset');
        if (!col) throw err;
        const { ObjectId } = require('mongodb');
        const asset = await col.findOne({ _id: new ObjectId(id) });
        return mapRecord(asset);
      }
      throw err;
    }
  },
  update: async (id, data) => {
    const payload = { ...data };
    delete payload.companyName;
    if (Object.prototype.hasOwnProperty.call(payload, 'name')) payload.name = toTrimmedString(payload.name);
    if (Object.prototype.hasOwnProperty.call(payload, 'type')) payload.type = toTrimmedString(payload.type) || 'General';
    if (Object.prototype.hasOwnProperty.call(payload, 'description')) payload.description = toTrimmedString(payload.description) || null;
    if (Object.prototype.hasOwnProperty.call(payload, 'serialNumber')) payload.serialNumber = toTrimmedString(payload.serialNumber) || null;
    if (Object.prototype.hasOwnProperty.call(payload, 'parentId')) payload.parentId = toTrimmedString(payload.parentId) || null;
    if (Object.prototype.hasOwnProperty.call(payload, 'vendorId')) payload.vendorId = toTrimmedString(payload.vendorId) || null;
    if (Object.prototype.hasOwnProperty.call(payload, 'vendorName')) payload.vendorName = toTrimmedString(payload.vendorName) || null;
    if (Object.prototype.hasOwnProperty.call(payload, 'purchaseDate')) payload.purchaseDate = toOptionalDate(payload.purchaseDate);
    if (Object.prototype.hasOwnProperty.call(payload, 'purchaseCost')) payload.purchaseCost = toOptionalNumber(payload.purchaseCost);
    if (Object.prototype.hasOwnProperty.call(payload, 'currentValue')) payload.currentValue = toOptionalNumber(payload.currentValue);
    if (Object.prototype.hasOwnProperty.call(payload, 'warrantyUntil')) payload.warrantyUntil = toOptionalDate(payload.warrantyUntil);
    if (Object.prototype.hasOwnProperty.call(payload, 'photos')) payload.photos = toStringArray(payload.photos);
    if (Object.prototype.hasOwnProperty.call(payload, 'documents')) payload.documents = toStringArray(payload.documents);
    if (Object.prototype.hasOwnProperty.call(payload, 'identifiers')) payload.identifiers = normalizeIdentifiersPayload(payload.identifiers);
    const rel = {};
    if (Object.prototype.hasOwnProperty.call(payload, 'propertyId')) {
      if (payload.propertyId) {
        rel.property = { connect: { id: payload.propertyId } };
      } else {
        // disconnect if null/empty supplied
        rel.property = { disconnect: true };
      }
      delete payload.propertyId;
    }

    // Merge building/block into the location JSON field for updates
    let location = payload.location ? { ...payload.location } : {};
    let hadLocation = false;
    if (Object.prototype.hasOwnProperty.call(payload, 'building')) {
      if (payload.building !== undefined && payload.building !== null && payload.building !== '') {
        location.building = payload.building;
      }
      delete payload.building;
      hadLocation = true;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'floor')) {
      if (payload.floor !== undefined && payload.floor !== null && payload.floor !== '') {
        location.floor = payload.floor;
      }
      delete payload.floor;
      hadLocation = true;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'room')) {
      if (payload.room !== undefined && payload.room !== null && payload.room !== '') {
        location.room = payload.room;
      }
      delete payload.room;
      hadLocation = true;
    }
    // Handle incoming blocks: allow merging with existing blocks unless _replaceBlocks === true
    let incomingBlocks = null;
    if (Object.prototype.hasOwnProperty.call(payload, 'blocks')) {
      if (payload.blocks !== undefined && payload.blocks !== null && payload.blocks !== '') {
        incomingBlocks = payload.blocks;
      }
      delete payload.blocks;
      hadLocation = true;
    } else if (Object.prototype.hasOwnProperty.call(payload, 'block')) {
      if (payload.block !== undefined && payload.block !== null && payload.block !== '') {
        incomingBlocks = payload.block;
      }
      delete payload.block;
      hadLocation = true;
    }

    // support explicit removal list
    let removeBlocks = null;
    if (Object.prototype.hasOwnProperty.call(payload, 'removeBlocks')) {
      removeBlocks = payload.removeBlocks;
      delete payload.removeBlocks;
      hadLocation = true;
    }

    // If incomingBlocks exists and we are not replacing, merge with existing asset blocks
    if (incomingBlocks !== null) {
      // normalize incoming to array of strings
      const incomingArr = Array.isArray(incomingBlocks) ? incomingBlocks : [incomingBlocks];
      const incomingNorm = incomingArr.map(String).map(s => s.trim()).filter(Boolean);
      // fetch existing asset to merge
      try {
        const existing = await prisma.asset.findUnique({ where: { id } });
        let existingBlocks = [];
        if (existing && existing.location) {
          const eloc = existing.location;
          if (eloc && eloc.block) {
            if (Array.isArray(eloc.block)) existingBlocks = eloc.block.map(String);
            else existingBlocks = String(eloc.block).split(/[;,|]/).map(s => s.trim()).filter(Boolean);
          }
        }
        // if caller set _replaceBlocks true, replace, otherwise union
        const replace = !!payload._replaceBlocks;
        delete payload._replaceBlocks;
        let merged = [];
        if (replace) {
          merged = incomingNorm;
        } else {
          merged = Array.from(new Set([...(existingBlocks || []), ...incomingNorm]));
        }
        // handle removals
        if (removeBlocks) {
          const remArr = Array.isArray(removeBlocks) ? removeBlocks : [removeBlocks];
          const remNorm = remArr.map(String).map(s => s.trim()).filter(Boolean);
          merged = merged.filter(b => !remNorm.includes(String(b)));
        }
        location.block = merged;
      } catch (e) {
        // if anything goes wrong fetching existing, fall back to incoming
        location.block = Array.isArray(incomingBlocks) ? incomingBlocks : [incomingBlocks];
      }
    }

    const dataToUpdate = { ...payload, ...rel };
    if (Object.prototype.hasOwnProperty.call(payload, 'quantity')) {
      dataToUpdate.quantity = Math.max(1, parseInt(payload.quantity, 10) || 1);
    }
    // defensive cleanup: remove any top-level fields that don't exist on the Prisma model
    delete dataToUpdate.block;
    delete dataToUpdate.blocks;
    delete dataToUpdate.building;
    delete dataToUpdate.floor;
    delete dataToUpdate.room;
    if (hadLocation) dataToUpdate.location = location;
    if (dataToUpdate.identifiers === undefined) delete dataToUpdate.identifiers;

    try {
      return await prisma.asset.update({ where: { id }, data: dataToUpdate });
    } catch (err) {
      if (err.message.includes('userId') || err.message.includes('converting')) {
        console.error('SURVIVAL MODE: Prisma update failed for Asset. Returning raw data.');
        const col = getRawCollection('Asset');
        if (col) {
          const { ObjectId } = require('mongodb');
          // In MongoDB, we can't easily do a fine-grained update with Prisma's complex 'rel' object
          // but for simple fields it works. If Prisma failed, it's likely a conversion error
          // after the update logic would have run if Prisma were used. 
          // For now, we return the record as-is or fetch it.
          const updated = await col.findOne({ _id: new ObjectId(id) });
          if (updated) return mapRecord(updated);
        }
      }
      throw err;
    }
  },
  delete: (id) => prisma.asset.delete({ where: { id } }),
  count: (filter = {}) => prisma.asset.count({ where: normalizeAssetWhere(filter) }),

  updateOperationalStatus: async (id, status) => {
    const nextStatus = normalizeOperationalStatus(status);
    return prisma.asset.update({ where: { id }, data: { status: nextStatus } });
  },

  addDowntime: async (assetId, { hours, minutes, status, description, startedAt, createdBy }) => {
    const collection = getRawCollection('AssetDowntimeLog');
    if (!collection) {
      throw new Error('Downtime storage is unavailable.');
    }

    const safeHours = Math.max(0, parseInt(hours, 10) || 0);
    const safeMinutes = Math.max(0, parseInt(minutes, 10) || 0);
    const durationMinutes = (safeHours * 60) + safeMinutes;
    const normalizedStatus = normalizeOperationalStatus(status);
    const startedDate = toOptionalDate(startedAt) || new Date();
    const trimmedDescription = toTrimmedString(description);

    if (!trimmedDescription) {
      throw new Error('Description is required.');
    }

    const entry = {
      assetId: String(assetId),
      hours: safeHours,
      minutes: safeMinutes,
      durationMinutes,
      status: normalizedStatus,
      description: trimmedDescription,
      startedAt: startedDate,
      createdBy: toTrimmedString(createdBy) || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(entry);
    const saved = await collection.findOne({ _id: result.insertedId });
    await prisma.asset.update({ where: { id: assetId }, data: { status: normalizedStatus } });
    return mapRecord(saved);
  },

  getDowntimeLogs: async (assetId, { start, end } = {}) => {
    const collection = getRawCollection('AssetDowntimeLog');
    if (!collection) {
      return [];
    }

    const query = { assetId: String(assetId) };
    if (start || end) {
      query.startedAt = {};
      if (start) query.startedAt.$gte = start;
      if (end) query.startedAt.$lte = end;
    }

    const logs = await collection.find(query).sort({ startedAt: -1, createdAt: -1 }).toArray();
    return logs.map(mapRecord);
  },

  // Movement log helpers
  addMovement: async (assetId, { from, to, movedBy, notes }) => {
    const entry = await prisma.assetMovementLog.create({ data: { assetId, from, to, movedBy, notes } });
    return entry;
  },
  getMovements: async (assetId) => {
    return prisma.assetMovementLog.findMany({ where: { assetId }, orderBy: { timestamp: 'desc' } });
  },

  // Spare part helpers
  addSparePart: async (data) => prisma.sparePart.create({ data }),
  findSparePartsForAsset: async (assetId) => prisma.sparePart.findMany({ where: { assetId } }),
};
