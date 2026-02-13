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
  create: (data) => prisma.internalTechnician.create({ data }),
  findAll: async (filter = {}) => {
    try {
      return await prisma.internalTechnician.findMany({ where: filter, include: { property: true } });
    } catch (err) {
      if (err.message.includes('userId') && (err.message.includes('null') || err.message.includes('converting'))) {
        console.error('CRITICAL: Prisma conversion error detected for InternalTechnician. Falling back to raw MongoDB query.');
        const db = require('mongoose').connection.db;
        if (!db) throw err;
        const techs = await db.collection('InternalTechnician').find(filter).toArray();
        return techs.map(t => {
          const mapped = { ...t, id: t._id.toString() };
          delete mapped._id;
          return mapped;
        });
      }
      throw err;
    }
  },
  findById: (id) => prisma.internalTechnician.findUnique({ where: { id: toObjectId(id) }, include: { property: true } }),
  update: (id, data) => prisma.internalTechnician.update({ where: { id: toObjectId(id) }, data }),
  delete: (id) => prisma.internalTechnician.delete({ where: { id: toObjectId(id) } }),
};