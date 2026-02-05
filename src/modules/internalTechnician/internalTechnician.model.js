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
  findAll: (filter = {}) => prisma.internalTechnician.findMany({ where: filter, include: { property: true } }),
  findById: (id) => prisma.internalTechnician.findUnique({ where: { id: toObjectId(id) }, include: { property: true } }),
  update: (id, data) => prisma.internalTechnician.update({ where: { id: toObjectId(id) }, data }),
  delete: (id) => prisma.internalTechnician.delete({ where: { id: toObjectId(id) } }),
};