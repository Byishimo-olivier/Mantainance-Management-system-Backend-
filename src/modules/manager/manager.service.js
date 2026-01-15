const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  getAll: () => prisma.manager.findMany(),
  getById: (id) => prisma.manager.findUnique({ where: { id: Number(id) } }),
  create: (data) => prisma.manager.create({ data }),
  update: (id, data) => prisma.manager.update({ where: { id: Number(id) }, data }),
  delete: (id) => prisma.manager.delete({ where: { id: Number(id) } }),
  // Dashboard summary: counts by status
  getDashboardSummary: async () => {
    const [pending, inProgress, completed, overdue] = await Promise.all([
      prisma.issue.count({ where: { tags: { has: 'PENDING' } } }),
      prisma.issue.count({ where: { tags: { has: 'IN PROGRESS' } } }),
      prisma.issue.count({ where: { tags: { has: 'COMPLETED' } } }),
      prisma.issue.count({ where: { overdue: true } }),
    ]);
    return { pending, inProgress, completed, overdue };
  },
};
