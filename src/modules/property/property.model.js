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

// Helper to translate Prisma filters to raw MongoDB filters (handles OR -> $or and ObjectId conversion)
const translateFilterToMongo = (filter) => {
  if (!filter || typeof filter !== 'object') return filter;
  const { ObjectId } = require('mongodb');

  const translateValue = (val) => {
    if (typeof val === 'string' && /^[a-fA-F0-9]{24}$/.test(val)) {
      try { return new ObjectId(val); } catch (e) { return val; }
    }
    if (Array.isArray(val)) return val.map(translateValue);
    if (val && typeof val === 'object' && !(val instanceof ObjectId) && !(val instanceof Date)) {
      return translateFilterToMongo(val);
    }
    return val;
  };

  const translated = {};
  for (const key in filter) {
    if (key === 'OR') {
      translated.$or = translateValue(filter.OR);
    } else if (key === 'AND') {
      translated.$and = translateValue(filter.AND);
    } else if (key === 'in') {
      // Prisma { field: { in: [...] } } -> MongoDB { field: { $in: [...] } }
      // This helper is usually called on the filter object itself, 
      // but Prisma nesting means key might be 'in' if we are inside a field's object.
      translated.$in = translateValue(filter.in);
    } else {
      translated[key] = translateValue(filter[key]);
    }
  }
  return translated;
};

const PRISMA_FIELDS = [
  'name',
  'type',
  'address',
  'city',
  'country',
  'contactName',
  'phone',
  'email',
  'status',
  'clientId',
  'beds',
  'baths',
  'area',
  'floors',
  'blocks',
  'block',
  'rooms',
  'roomNames',
  'namedBlocks',
  'blocksModifiable',
  'includeMapCoordinates',
  'photos',
  'latitude',
  'longitude',
  'parentPropertyId',
  'assignedWorkers',
  'assignedTeam',
  'vendors',
  'customers',
  'customData',
  'createdAt',
  'userId'
];

const PRISMA_FILTER_FIELDS = new Set([...PRISMA_FIELDS, 'id']);

const NUMERIC_FIELDS = new Set(['beds', 'baths', 'area', 'floors', 'rooms']);
const FLOAT_FIELDS = new Set(['latitude', 'longitude']);
const BOOLEAN_FIELDS = new Set(['includeMapCoordinates', 'blocksModifiable']);

const normalizeList = (val) => {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    return trimmed.split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
  }
  return [String(val)].filter(Boolean);
};

const sanitizePropertyData = (data) => {
  if (!data || typeof data !== 'object') return {};
  const cleaned = {};

  for (const [key, rawVal] of Object.entries(data)) {
    if (!module.exports._prismaFields.has(key)) continue;
    if (rawVal === '' || rawVal === undefined) continue;

    if (NUMERIC_FIELDS.has(key)) {
      const num = Number(rawVal);
      if (!Number.isNaN(num)) cleaned[key] = num;
      continue;
    }

    if (FLOAT_FIELDS.has(key)) {
      const num = Number(rawVal);
      if (!Number.isNaN(num)) cleaned[key] = num;
      continue;
    }

    if (BOOLEAN_FIELDS.has(key)) {
      if (typeof rawVal === 'boolean') cleaned[key] = rawVal;
      else if (typeof rawVal === 'string') cleaned[key] = ['true', '1', 'yes', 'on'].includes(rawVal.toLowerCase());
      continue;
    }

    if (key === 'blocks') {
      if (Array.isArray(rawVal)) {
        const list = normalizeList(rawVal);
        if (list.length === 0) continue;
        const allNumeric = list.length === 1 && !Number.isNaN(Number(list[0]));
        cleaned[key] = allNumeric ? Number(list[0]) : list;
      } else if (typeof rawVal === 'string') {
        const trimmed = rawVal.trim();
        if (!trimmed) continue;
        const maybeNum = Number(trimmed);
        if (!Number.isNaN(maybeNum) && /^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
          cleaned[key] = maybeNum;
        } else if (trimmed.match(/[;,|]/)) {
          cleaned[key] = normalizeList(trimmed);
        } else {
          cleaned[key] = trimmed;
        }
      } else {
        cleaned[key] = rawVal;
      }
      continue;
    }

    if (key === 'namedBlocks' || key === 'roomNames') {
      const list = normalizeList(rawVal);
      if (list.length) cleaned[key] = list;
      continue;
    }

    if (key === 'assignedWorkers' || key === 'photos') {
      cleaned[key] = normalizeList(rawVal);
      continue;
    }

    cleaned[key] = rawVal;
  }

  if (cleaned.blocks === undefined && Array.isArray(cleaned.namedBlocks) && cleaned.namedBlocks.length) {
    cleaned.blocks = cleaned.namedBlocks;
  }

  return cleaned;
};

const sanitizePrismaFilter = (filter) => {
  if (!filter || typeof filter !== 'object') {
    return { filter, hasUnsupported: false, hasKeys: false };
  }
  if (Array.isArray(filter)) {
    const cleaned = [];
    let hasUnsupported = false;
    for (const item of filter) {
      const res = sanitizePrismaFilter(item);
      hasUnsupported = hasUnsupported || res.hasUnsupported;
      if (res.filter && typeof res.filter === 'object' && Object.keys(res.filter).length > 0) {
        cleaned.push(res.filter);
      }
    }
    return { filter: cleaned, hasUnsupported, hasKeys: cleaned.length > 0 };
  }

  const cleaned = {};
  let hasUnsupported = false;
  let hasKeys = false;
  for (const [key, val] of Object.entries(filter)) {
    if (key === 'OR' || key === 'AND') {
      const res = sanitizePrismaFilter(val);
      hasUnsupported = hasUnsupported || res.hasUnsupported;
      if (Array.isArray(res.filter) && res.filter.length > 0) {
        cleaned[key] = res.filter;
        hasKeys = true;
      }
      continue;
    }
    if (!PRISMA_FILTER_FIELDS.has(key)) {
      hasUnsupported = true;
      continue;
    }
    cleaned[key] = val;
    hasKeys = true;
  }
  return { filter: cleaned, hasUnsupported, hasKeys };
};

module.exports = {
  // Prisma schema fields we can safely send to prisma.property.update
  _prismaFields: new Set(PRISMA_FIELDS),
  create: async (data) => {
    try {
      const prismaData = sanitizePropertyData(data);
      return await prisma.property.create({ data: prismaData });
    } catch (err) {
      if (err.message.includes('userId') || err.message.includes('converting')) {
        console.error('SURVIVAL MODE: Prisma create failed for Property. Returning raw data.');
        const col = getRawCollection('Property');
        if (col) {
          const saved = await col.findOne({ name: data.name, createdAt: { $gte: new Date(Date.now() - 5000) } });
          if (saved) return mapRecord(saved);
        }
      }
      throw err;
    }
  },
  findAll: async (filter = {}) => {
    const col = getRawCollection('Property');
    if (col) {
      const mongoFilter = translateFilterToMongo(filter);
      const props = await col.find(mongoFilter).toArray();
      return props.map(mapRecord);
    }
    const { filter: prismaFilter, hasUnsupported, hasKeys } = sanitizePrismaFilter(filter);
    if (hasUnsupported && !hasKeys) {
      return [];
    }
    try {
      return await prisma.property.findMany({ where: prismaFilter, include: { assets: true, internalTechnicians: true } });
    } catch (err) {
      if (err.message.includes('userId') || err.message.includes('converting') || err.message.includes('Unknown argument') || err.message.includes('requestorId')) {
        console.error('CRITICAL: Prisma conversion error detected for Property. Falling back to raw MongoDB query.');
        const col = getRawCollection('Property');
        if (!col) throw err;

        // Translate Prisma-style filter to MongoDB-style
        const mongoFilter = translateFilterToMongo(filter);

        const props = await col.find(mongoFilter).toArray();
        return props.map(mapRecord);
      }
      throw err;
    }
  },
  findById: async (id) => {
    const col = getRawCollection('Property');
    if (col) {
      const { ObjectId } = require('mongodb');
      const prop = await col.findOne({ _id: new ObjectId(id) });
      return mapRecord(prop);
    }
    try {
      return await prisma.property.findUnique({ where: { id }, include: { assets: true, internalTechnicians: true } });
    } catch (err) {
      if (err.message.includes('userId') || err.message.includes('converting')) {
        console.error('SURVIVAL MODE: Prisma findById failed for Property. Falling back to raw.');
        const col = getRawCollection('Property');
        if (!col) throw err;
        const { ObjectId } = require('mongodb');
        const prop = await col.findOne({ _id: new ObjectId(id) });
        return mapRecord(prop);
      }
      throw err;
    }
  },
  update: async (id, data) => {
    const col = getRawCollection('Property');
    if (col) {
      const { ObjectId } = require('mongodb');
      await col.updateOne({ _id: new ObjectId(id) }, { $set: data });
      const updated = await col.findOne({ _id: new ObjectId(id) });
      if (updated) return mapRecord(updated);
    }
    const prismaData = sanitizePropertyData(data);
    try {
      return await prisma.property.update({ where: { id }, data: prismaData });
    } catch (err) {
      console.error('SURVIVAL MODE: Prisma update failed for Property. Falling back to raw update.', err.message);
      if (col) return mapRecord(await col.findOne({ _id: new (require('mongodb').ObjectId)(id) }));
      throw err;
    }
  },
  delete: (id) => prisma.property.delete({ where: { id } }),
};
