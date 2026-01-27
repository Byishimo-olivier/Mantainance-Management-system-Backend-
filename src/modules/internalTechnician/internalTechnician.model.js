const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  create: (data) => prisma.internalTechnician.create({ data }),
  findAll: (filter = {}) => prisma.internalTechnician.findMany({ where: filter, include: { property: true } }),
  findById: (id) => prisma.internalTechnician.findUnique({ where: { id }, include: { property: true } }),
  update: (id, data) => prisma.internalTechnician.update({ where: { id }, data }),
  delete: (id) => prisma.internalTechnician.delete({ where: { id } }),
};