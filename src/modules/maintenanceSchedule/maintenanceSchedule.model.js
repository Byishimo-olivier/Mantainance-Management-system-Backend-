const { PrismaClient } = require('@prisma/client');
const { ObjectId } = require('mongodb');
const prisma = new PrismaClient();

function mapRecord(record) {
  if (!record) return null;
  const mapped = { ...record, id: record._id.toString() };
  delete mapped._id;
  return mapped;
}

function getRawCollection() {
  const mongoose = require('mongoose');
  if (mongoose.connection && mongoose.connection.db) {
    return mongoose.connection.db.collection('MaintenanceSchedule');
  }
  return null;
}

function translateData(data) {
  if (!data || typeof data !== 'object') return data;
  const out = { ...data };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === 'string' && /^[a-fA-F0-9]{24}$/.test(out[k])) {
      try { out[k] = new ObjectId(out[k]); } catch (e) { /* ignore */ }
    }
  }
  return out;
}

module.exports = {
  create: async (data) => {
    // Prefer Mongo directly to avoid Prisma schema strictness/engine errors
    const col = getRawCollection();
    if (col) {
      const mongoData = translateData(data);
      const result = await col.insertOne({ ...mongoData, createdAt: new Date() });
      const saved = await col.findOne({ _id: result.insertedId });
      return mapRecord(saved);
    }
    return prisma.maintenanceSchedule.create({ data });
  },
  // Prisma is strict about non-nullable fields and existing null data breaks reads; use Mongo directly for stability.
  findAll: async (filter = {}) => {
    const col = getRawCollection();
    if (!col) {
      // As a last resort, try Prisma
      return prisma.maintenanceSchedule.findMany({ where: filter, include: { technician: true } });
    }
    const scheds = await col.find(filter).toArray();
    return scheds.map(mapRecord);
  },
  findById: async (id) => {
    const col = getRawCollection();
    if (col) {
      const rec = await col.findOne({ _id: new ObjectId(id) });
      return mapRecord(rec);
    }
    return prisma.maintenanceSchedule.findUnique({ where: { id }, include: { technician: true } });
  },
  update: async (id, data) => {
    const col = getRawCollection();
    if (col) {
      const mongoData = translateData(data);
      await col.updateOne({ _id: new ObjectId(id) }, { $set: mongoData });
      const rec = await col.findOne({ _id: new ObjectId(id) });
      return mapRecord(rec);
    }
    return prisma.maintenanceSchedule.update({ where: { id }, data });
  },
  delete: async (id) => {
    const col = getRawCollection();
    if (col) {
      await col.deleteOne({ _id: new ObjectId(id) });
      return { id };
    }
    return prisma.maintenanceSchedule.delete({ where: { id } });
  },
};
