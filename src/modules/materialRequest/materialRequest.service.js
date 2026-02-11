const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  getAll: async () => {
    const reqs = await prisma.materialRequest.findMany();
    // attach items for each request
    for (const r of reqs) {
      const items = await prisma.materialRequestItem.findMany({ where: { materialRequestId: r.id } });
      r.items = items;
    }
    return reqs;
  },
  getById: (id) => prisma.materialRequest.findUnique({ where: { id } }),
  getByTechnician: async (techId) => {
    const reqs = await prisma.materialRequest.findMany({ where: { technicianId: techId } });
    for (const r of reqs) {
      const items = await prisma.materialRequestItem.findMany({ where: { materialRequestId: r.id } });
      r.items = items;
    }
    return reqs;
  },
  create: (data) => prisma.materialRequest.create({ data }),
  // Create a material request and associated items array.
  createWithItems: async (data, items = []) => {
    const created = await prisma.materialRequest.create({ data });
    let createdItems = [];
    if (items && items.length > 0) {
      const toCreate = items.map((it) => ({
        // store title in materialId when no real materialId provided so frontend can display it
        materialId: it.materialId || it.title || `ITEM-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        quantity: it.quantity || 1,
        materialRequestId: created.id
      }));
      // create items individually (Prisma createMany with ObjectId may be problematic)
      for (const item of toCreate) {
        const ci = await prisma.materialRequestItem.create({ data: item });
        createdItems.push(ci);
      }
    }
    created.items = createdItems;
    return created;
  },
  update: (id, data) => prisma.materialRequest.update({ where: { id }, data }),
  delete: (id) => prisma.materialRequest.delete({ where: { id } }),
};
