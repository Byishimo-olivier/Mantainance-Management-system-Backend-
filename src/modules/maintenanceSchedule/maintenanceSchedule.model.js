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
    try {
      return await prisma.maintenanceSchedule.create({ data });
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes('userId') || errMsg.includes('converting') || errMsg.includes('missing') || errMsg.includes('invocation') || errMsg.includes('Prisma')) {
        console.error('SURVIVAL MODE: Prisma create failed for MaintenanceSchedule. Falling back to raw MongoDB.', errMsg);
        const col = getRawCollection();
        if (col) {
          const mongoData = translateData(data);
          const result = await col.insertOne({ ...mongoData, createdAt: new Date() });
          const saved = await col.findOne({ _id: result.insertedId });
          return mapRecord(saved);
        }
      }
      throw err;
    }
  },
  findAll: async (filter = {}) => {
    try {
      return await prisma.maintenanceSchedule.findMany({ where: filter, include: { technician: true } });
    } catch (err) {
      if (err.message.includes('userId') && (err.message.includes('null') || err.message.includes('converting'))) {
        console.error('CRITICAL: Prisma conversion error detected for MaintenanceSchedule. Falling back to raw MongoDB query.');
        const col = getRawCollection();
        if (!col) throw err;
        const scheds = await col.find(filter).toArray();
        return scheds.map(mapRecord);
      }
      throw err;
    }
  },
  findById: (id) => prisma.maintenanceSchedule.findUnique({ where: { id }, include: { technician: true } }),
  update: (id, data) => prisma.maintenanceSchedule.update({ where: { id }, data }),
  delete: (id) => prisma.maintenanceSchedule.delete({ where: { id } }),
};