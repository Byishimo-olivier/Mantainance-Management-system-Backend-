const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  getAll: () => prisma.issue.findMany(),
  getById: (id) => prisma.issue.findUnique({ where: { id } }),
  getByUserId: (userId) => prisma.issue.findMany({ where: { userId } }),
  // Support both assignedTo (single tech) and assignees (array of techs)
  getByAssignedTech: async (techId) => {
    const issues = await prisma.issue.findMany({
      where: {
        OR: [
          { assignedTo: techId },
          { assignees: { has: techId } },
        ],
      },
    });
    return issues;
  },
  create: (data) => prisma.issue.create({ data }),
  update: (id, data) => {
    // Remove id from data if present
    if ('id' in data) delete data.id;
    return prisma.issue.update({ where: { id }, data });
  },
  delete: (id) => prisma.issue.delete({ where: { id } }),
};
