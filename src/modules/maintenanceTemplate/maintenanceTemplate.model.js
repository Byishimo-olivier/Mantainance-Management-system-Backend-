const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  create: (data) => prisma.maintenanceTemplate.create({ data }),
  findAll: (filter = {}) => prisma.maintenanceTemplate.findMany({ where: filter }),
  findById: (id) => prisma.maintenanceTemplate.findUnique({ where: { id } }),
  update: (id, data) => prisma.maintenanceTemplate.update({ where: { id }, data }),
  delete: (id) => prisma.maintenanceTemplate.delete({ where: { id } }),
};