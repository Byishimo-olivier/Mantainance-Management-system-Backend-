const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  create: (data) => prisma.asset.create({ data: { ...data, quantity: data.quantity ?? 1 } }),
  findAll: (filter = {}) => prisma.asset.findMany({ where: filter, include: { property: true, spareParts: true } }),
  findById: (id) => prisma.asset.findUnique({ where: { id }, include: { property: true, spareParts: true, movements: true } }),
  update: (id, data) => prisma.asset.update({ where: { id }, data: { ...data, quantity: data.quantity ?? 1 } }),
  delete: (id) => prisma.asset.delete({ where: { id } }),
  count: (filter = {}) => prisma.asset.count({ where: filter }),

  // Movement log helpers
  addMovement: async (assetId, { from, to, movedBy, notes }) => {
    const entry = await prisma.assetMovementLog.create({ data: { assetId, from, to, movedBy, notes } });
    return entry;
  },
  getMovements: async (assetId) => {
    return prisma.assetMovementLog.findMany({ where: { assetId }, orderBy: { timestamp: 'desc' } });
  },

  // Spare part helpers
  addSparePart: async (data) => prisma.sparePart.create({ data }),
  findSparePartsForAsset: async (assetId) => prisma.sparePart.findMany({ where: { assetId } }),
};