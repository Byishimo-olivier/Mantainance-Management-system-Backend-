const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  getAll: () => prisma.issue.findMany(),
  getById: (id) => prisma.issue.findUnique({ where: { id } }),
  getByUserId: async (userId) => {
    // Return issues that the user created OR issues tied to assets/properties
    console.log('[getByUserId] Querying issues for userId:', userId);
    const userIssues = await prisma.issue.findMany({ where: { userId } });
    console.log('[getByUserId] Found userIssues count:', userIssues.length);
    if (userIssues.length > 0) {
      console.log('[getByUserId] Sample userIssue:', { id: userIssues[0].id, userId: userIssues[0].userId, title: userIssues[0].title });
    }

    // Find any InternalTechnician entries that match the user's email/phone
    // This lets us find properties where the user is listed as an internal technician
    try {
      const userService = require('../user/user.service');
      const user = await userService.findUserById(userId);
      if (!user) return userIssues;

      const email = user.email;
      const phone = user.phone;

      const techEntries = await prisma.internalTechnician.findMany({
        where: {
          OR: [
            email ? { email } : undefined,
            phone ? { phone } : undefined,
          ].filter(Boolean)
        }
      });

      const propertyIds = techEntries.map(t => t.propertyId).filter(Boolean);

      let assetIds = [];
      if (propertyIds.length) {
        const assets = await prisma.asset.findMany({ where: { propertyId: { in: propertyIds } }, select: { id: true } });
        assetIds = assets.map(a => a.id);
      }

      let assetIssues = [];
      if (assetIds.length) {
        assetIssues = await prisma.issue.findMany({ where: { assetId: { in: assetIds } } });
      }

      // Merge and deduplicate by id
      const map = new Map();
      [...userIssues, ...assetIssues].forEach(i => { if (i && i.id) map.set(i.id, i); });
      return Array.from(map.values());
    } catch (e) {
      console.error('Error expanding getByUserId for related assets/properties:', e);
      return userIssues;
    }
  },
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
  // Find issues for properties where the technician is listed as an InternalTechnician
  getByTechnicianProperties: async (techUserId) => {
    try {
      const userService = require('../user/user.service');
      const user = await userService.findUserById(techUserId);
      if (!user) return [];
      const email = user.email;
      const phone = user.phone;
      const techEntries = await prisma.internalTechnician.findMany({
        where: {
          OR: [
            email ? { email } : undefined,
            phone ? { phone } : undefined,
          ].filter(Boolean)
        }
      });
      const propertyIds = techEntries.map(t => t.propertyId).filter(Boolean);
      if (!propertyIds.length) return [];
      const assets = await prisma.asset.findMany({ where: { propertyId: { in: propertyIds } }, select: { id: true } });
      const assetIds = assets.map(a => a.id);
      if (!assetIds.length) return [];
      const issues = await prisma.issue.findMany({ where: { assetId: { in: assetIds } } });
      return issues;
    } catch (e) {
      console.error('Error in getByTechnicianProperties:', e);
      return [];
    }
  },
  // Find issues for a specific property (by propertyId). Includes issues that were
  // created with a propertyId or issues linked to assets belonging to the property.
  getByPropertyId: async (propertyId) => {
    try {
      if (!propertyId) return [];
      console.log('[getByPropertyId] Querying for propertyId:', propertyId);

      // Find assets under the property
      const assets = await prisma.asset.findMany({ where: { propertyId }, select: { id: true } });
      const assetIds = assets.map(a => a.id).filter(Boolean);
      console.log('[getByPropertyId] Found assets:', assetIds.length);

      const whereClause = {
        OR: [
          { propertyId },
          ...(assetIds.length ? [{ assetId: { in: assetIds } }] : []),
        ]
      };

      const issues = await prisma.issue.findMany({ where: whereClause });
      console.log('[getByPropertyId] Found issues:', issues.length);
      issues.forEach(i => {
        console.log(`  - Issue: ${i.title} | anonId: ${i.anonId} | userId: ${i.userId} | propertyId: ${i.propertyId}`);
      });
      return issues;
    } catch (e) {
      console.error('Error in getByPropertyId:', e);
      return [];
    }
  },
  // Find issues for a list of property IDs
  getByPropertyIds: async (propertyIds) => {
    try {
      if (!propertyIds || propertyIds.length === 0) return [];

      // Find assets under these properties
      const assets = await prisma.asset.findMany({
        where: { propertyId: { in: propertyIds } },
        select: { id: true }
      });
      const assetIds = assets.map(a => a.id).filter(Boolean);

      const whereClause = {
        OR: [
          { propertyId: { in: propertyIds } },
          ...(assetIds.length ? [{ assetId: { in: assetIds } }] : []),
        ]
      };

      const issues = await prisma.issue.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' }
      });

      return issues;
    } catch (e) {
      console.error('Error in getByPropertyIds:', e);
      return [];
    }
  },
  // Find issues for properties where the manager/user is listed as a property contact (internalTechnician)
  getByManagerId: async (managerUserId) => {
    try {
      const userService = require('../user/user.service');
      const user = await userService.findUserById(managerUserId);
      if (!user) return [];
      const email = user.email;
      const phone = user.phone;

      // Find properties where internalTechnicians include this manager (by email or phone)
      const properties = await prisma.property.findMany({
        where: {
          OR: [
            email ? { internalTechnicians: { some: { email } } } : undefined,
            phone ? { internalTechnicians: { some: { phone } } } : undefined,
          ].filter(Boolean)
        },
        select: { id: true }
      });
      const propertyIds = properties.map(p => p.id).filter(Boolean);
      if (!propertyIds.length) return [];

      const assets = await prisma.asset.findMany({ where: { propertyId: { in: propertyIds } }, select: { id: true } });
      const assetIds = assets.map(a => a.id);
      if (!assetIds.length) return [];

      const issues = await prisma.issue.findMany({ where: { assetId: { in: assetIds } } });
      return issues;
    } catch (e) {
      console.error('Error in getByManagerId:', e);
      return [];
    }
  },
  create: (data) => prisma.issue.create({ data }),
  update: (id, data) => {
    // Remove id from data if present
    if ('id' in data) delete data.id;
    return prisma.issue.update({ where: { id }, data });
  },
  delete: (id) => prisma.issue.delete({ where: { id } }),
};
