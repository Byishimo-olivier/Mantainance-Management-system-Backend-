const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  getAll: () => prisma.issue.findMany(),
  getById: (id) => prisma.issue.findUnique({ where: { id } }),
  getByUserId: (userId) => prisma.issue.findMany({ where: { userId } }),
  // Support both assignedTo (single tech) and assignees (array of techs)
  getByAssignedTech: async (techId) => {
    console.log('[getByAssignedTech] techId:', techId);
    // Use raw MongoDB query for assignees.id
    const issues = await prisma.issue.findMany({
      where: {
        OR: [
          { assignedTo: techId },
        ]
      },
    });
    // Now filter in JS for assignees.id match (since Prisma can't do this for arrays of objects)
    const allIssues = await prisma.issue.findMany();
    const withAssignee = allIssues.filter(issue => Array.isArray(issue.assignees) && issue.assignees.some(a => a && a.id === techId));
    // Merge and deduplicate
    const merged = [...issues, ...withAssignee.filter(i => !issues.some(j => j.id === i.id))];
    console.log('[getByAssignedTech] issues found:', merged.map(i => ({ id: i.id, assignedTo: i.assignedTo, assignees: i.assignees })));
    return merged;
  },
  create: (data) => prisma.issue.create({ data }),
  update: (id, data) => {
    // Remove id from data if present
    if ('id' in data) delete data.id;
    return prisma.issue.update({ where: { id }, data });
  },
  delete: (id) => prisma.issue.delete({ where: { id } }),
};
