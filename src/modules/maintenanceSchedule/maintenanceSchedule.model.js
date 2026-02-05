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
  findAll: (filter = {}) => prisma.maintenanceSchedule.findMany({ where: filter, include: { technician: true } }),
  findById: (id) => prisma.maintenanceSchedule.findUnique({ where: { id: toObjectId(id) }, include: { technician: true } }),
  update: (id, data) => prisma.maintenanceSchedule.update({ where: { id: toObjectId(id) }, data }),
  delete: (id) => prisma.maintenanceSchedule.delete({ where: { id: toObjectId(id) } }),
};