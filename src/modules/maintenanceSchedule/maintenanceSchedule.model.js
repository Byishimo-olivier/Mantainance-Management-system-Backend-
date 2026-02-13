const { PrismaClient } = require('@prisma/client');
const { ObjectId } = require('mongodb');
const prisma = new PrismaClient();

function toObjectId(id) {
  try {
    return new ObjectId(id);
  } catch (e) {
    throw new Error('Invalid ObjectId');
  }
}

module.exports = {
  create: (data) => prisma.maintenanceSchedule.create({ data }),
  findAll: async (filter = {}) => {
    try {
      return await prisma.maintenanceSchedule.findMany({ where: filter, include: { technician: true } });
    } catch (err) {
      if (err.message.includes('userId') && (err.message.includes('null') || err.message.includes('converting'))) {
        console.error('CRITICAL: Prisma conversion error detected for MaintenanceSchedule. Falling back to raw MongoDB query.');
        const db = require('mongoose').connection.db;
        if (!db) throw err;
        const scheds = await db.collection('MaintenanceSchedule').find(filter).toArray();
        return scheds.map(s => {
          const mapped = { ...s, id: s._id.toString() };
          delete mapped._id;
          return mapped;
        });
      }
      throw err;
    }
  },
  findById: (id) => prisma.maintenanceSchedule.findUnique({ where: { id: toObjectId(id) }, include: { technician: true } }),
  update: (id, data) => prisma.maintenanceSchedule.update({ where: { id: toObjectId(id) }, data }),
  delete: (id) => prisma.maintenanceSchedule.delete({ where: { id: toObjectId(id) } }),
};