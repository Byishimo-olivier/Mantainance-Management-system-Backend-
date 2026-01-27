const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  create: (data) => prisma.property.create({ data }),
  findAll: (filter = {}) => prisma.property.findMany({ where: filter, include: { assets: true, internalTechnicians: true } }),
  findById: (id) => prisma.property.findUnique({ where: { id }, include: { assets: true, internalTechnicians: true } }),
  update: (id, data) => prisma.property.update({ where: { id }, data }),
  delete: (id) => prisma.property.delete({ where: { id } }),
};