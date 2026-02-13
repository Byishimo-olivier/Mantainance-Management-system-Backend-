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

module.exports = {
  create: async (data) => {
    try {
      return await prisma.property.create({ data });
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
    try {
      return await prisma.property.findMany({ where: filter, include: { assets: true, internalTechnicians: true } });
    } catch (err) {
      if (err.message.includes('userId') || err.message.includes('converting')) {
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
    try {
      return await prisma.property.update({ where: { id }, data });
    } catch (err) {
      if (err.message.includes('userId') || err.message.includes('converting')) {
        console.error('SURVIVAL MODE: Prisma update failed for Property. Returning raw data.');
        const col = getRawCollection('Property');
        if (col) {
          const { ObjectId } = require('mongodb');
          const updated = await col.findOne({ _id: new ObjectId(id) });
          if (updated) return mapRecord(updated);
        }
      }
      throw err;
    }
  },
  delete: (id) => prisma.property.delete({ where: { id } }),
};