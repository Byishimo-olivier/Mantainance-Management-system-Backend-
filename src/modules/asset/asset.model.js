const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  create: (data) => prisma.asset.create({ data }),
  findAll: (filter = {}) => prisma.asset.findMany({ where: filter, include: { property: true } }),
  findById: (id) => prisma.asset.findUnique({ where: { id }, include: { property: true } }),
  update: (id, data) => prisma.asset.update({ where: { id }, data }),
  delete: (id) => prisma.asset.delete({ where: { id } }),
};