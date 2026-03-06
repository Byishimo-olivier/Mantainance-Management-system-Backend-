const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function enrichRequests(reqs) {
  for (const r of reqs) {
    // Attach items
    const items = await prisma.materialRequestItem.findMany({ where: { materialRequestId: r.id } });
    r.items = items;

    // Attach technician name if missing
    if (!r.technicianName && r.technicianId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: r.technicianId },
          select: { name: true }
        });
        if (user) {
          r.technicianName = user.name;
        } else {
          // Try internal technician
          const tech = await prisma.internalTechnician.findFirst({
            where: { id: r.technicianId },
            select: { name: true }
          });
          if (tech) r.technicianName = tech.name;
        }
      } catch (err) {
        console.warn(`Failed to resolve name for tech ${r.technicianId}:`, err);
      }
    }
  }
  return reqs;
}

module.exports = {
  getAll: async () => {
    const reqs = await prisma.materialRequest.findMany({ orderBy: { createdAt: 'desc' } });
    return enrichRequests(reqs);
  },

  getById: (id) => prisma.materialRequest.findUnique({ where: { id } }),

  getByTechnician: async (techId) => {
    const reqs = await prisma.materialRequest.findMany({
      where: { technicianId: techId },
      orderBy: { createdAt: 'desc' }
    });
    return enrichRequests(reqs);
  },

  getByClient: async (clientId) => {
    const reqs = await prisma.materialRequest.findMany({
      where: { clientId, forwardedToClient: true },
      orderBy: { createdAt: 'desc' }
    });
    return enrichRequests(reqs);
  },

  create: (data) => prisma.materialRequest.create({ data }),

  createWithItems: async (data, items = []) => {
    const created = await prisma.materialRequest.create({ data });
    let createdItems = [];
    if (items && items.length > 0) {
      const toCreate = items.map((it) => ({
        materialId: it.materialId || it.title || `ITEM-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        quantity: it.quantity || 1,
        materialRequestId: created.id
      }));
      for (const item of toCreate) {
        const ci = await prisma.materialRequestItem.create({ data: item });
        createdItems.push(ci);
      }
    }
    created.items = createdItems;
    return created;
  },

  forwardToClient: async (id, clientId, issueId) => {
    return prisma.materialRequest.update({
      where: { id },
      data: {
        forwardedToClient: true,
        clientId: clientId || null,
        issueId: issueId || null,
        status: 'FORWARDED'
      }
    });
  },

  clientRespond: async (id, response) => {
    return prisma.materialRequest.update({
      where: { id },
      data: {
        clientResponse: response,
        status: response === 'APPROVED' ? 'APPROVED' : 'DECLINED'
      }
    });
  },

  update: (id, data) => prisma.materialRequest.update({ where: { id }, data }),
  delete: (id) => prisma.materialRequest.delete({ where: { id } }),
};
