const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  create: (data) => prisma.maintenanceSchedule.create({ data }),
  findAll: (filter = {}) => prisma.maintenanceSchedule.findMany({ where: filter, include: { technician: true } }),
  findById: (id) => prisma.maintenanceSchedule.findUnique({ where: { id }, include: { technician: true } }),
  update: (id, data) => prisma.maintenanceSchedule.update({ where: { id }, data }),
  delete: (id) => prisma.maintenanceSchedule.delete({ where: { id } }),
};