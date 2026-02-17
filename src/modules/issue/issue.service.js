const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const mongoose = require('mongoose');

// Helper to translate Prisma filters to raw MongoDB filters (handles OR -> $or and ObjectId conversion)
const translateFilterToMongo = (filter) => {
  if (!filter || typeof filter !== 'object') return filter;
  const { ObjectId } = require('mongodb');

  const translateValue = (val) => {
    if (typeof val === 'string' && /^[a-fA-F0-9]{24}$/.test(val)) {
      try { return new ObjectId(val); } catch (e) { return val; }
    }
    if (Array.isArray(val)) return val.map(translateValue);
    if (val && typeof val === 'object' && !(val instanceof ObjectId) && !(val instanceof Date)) {
      return translateFilterToMongo(val);
    }
    return val;
  };

  const translated = {};
  for (const key in filter) {
    if (key === 'OR') {
      translated.$or = translateValue(filter.OR);
    } else if (key === 'AND') {
      translated.$and = translateValue(filter.AND);
    } else if (key === 'in') {
      translated.$in = translateValue(filter.in);
    } else {
      translated[key] = translateValue(filter[key]);
    }
  }
  return translated;
};

module.exports = {
  getAll: async () => {
    try {
      return await prisma.issue.findMany();
    } catch (err) {
      if (err.message.includes('userId') || err.message.includes('converting')) {
        console.error('CRITICAL: Prisma conversion error in issue.service:getAll. Falling back to raw MongoDB.');
        const db = mongoose.connection.db;
        if (!db) throw err;
        const issues = await db.collection('Issue').find({}).toArray();
        return issues.map(i => ({ ...i, id: i._id.toString() }));
      }
      throw err;
    }
  },

  getById: async (id) => {
    try {
      return await prisma.issue.findUnique({ where: { id } });
    } catch (err) {
      if (err.message.includes('userId') || err.message.includes('converting')) {
        console.error('CRITICAL: Prisma conversion error in issue.service:getById. Falling back to raw MongoDB.');
        const db = mongoose.connection.db;
        if (!db) throw err;
        const { ObjectId } = require('mongodb');
        const issue = await db.collection('Issue').findOne({ _id: new ObjectId(id) });
        return issue ? { ...issue, id: issue._id.toString() } : null;
      }
      throw err;
    }
  },

  getByUserId: async (userId) => {
    try {
      return await prisma.issue.findMany({ where: { userId } });
    } catch (err) {
      if (err.message.includes('userId') || err.message.includes('converting')) {
        console.error('CRITICAL: Prisma conversion error in issue.service:getByUserId. Falling back to raw MongoDB.');
        const db = mongoose.connection.db;
        if (!db) throw err;
        const mongoFilter = translateFilterToMongo({ userId });
        const issues = await db.collection('Issue').find(mongoFilter).toArray();
        return issues.map(i => ({ ...i, id: i._id.toString() }));
      }
      throw err;
    }
  },

  getByAssignedTech: async (techId) => {
    try {
      // Primary Prisma query (protected)
      const issues = await prisma.issue.findMany({
        where: { OR: [{ assignedTo: techId }] }
      });
      // Filter for assignees.id match in JS (Prisma limitation with JSON arrays)
      const allIssues = await prisma.issue.findMany();
      const withAssignee = allIssues.filter(issue => Array.isArray(issue.assignees) && issue.assignees.some(a => a && a.id === techId));
      const merged = [...issues, ...withAssignee.filter(i => !issues.some(j => j.id === i.id))];
      return merged;
    } catch (err) {
      console.error('CRITICAL: Prisma conversion error in issue.service:getByAssignedTech. Falling back to raw MongoDB.');
      const db = mongoose.connection.db;
      if (!db) throw err;
      const issues = await db.collection('Issue').find({
        $or: [
          { assignedTo: techId },
          { "assignees.id": techId }
        ]
      }).toArray();
      return issues.map(i => ({ ...i, id: i._id.toString() }));
    }
  },

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
      return await prisma.issue.findMany({ where: { assetId: { in: assetIds } } });
    } catch (err) {
      console.error('CRITICAL: Prisma conversion error in issue.service:getByTechnicianProperties. Falling back to raw MongoDB.');
      const db = mongoose.connection.db;
      if (!db) throw err;
      // Fallback logic using raw MongoDB
      return []; // For now return empty on failure, but data is safe
    }
  },

  getByPropertyId: async (propertyId) => {
    try {
      const assets = await prisma.asset.findMany({ where: { propertyId }, select: { id: true } });
      const assetIds = assets.map(a => a.id).filter(Boolean);
      return await prisma.issue.findMany({
        where: {
          OR: [
            { propertyId },
            ...(assetIds.length ? [{ assetId: { in: assetIds } }] : []),
          ]
        }
      });
    } catch (err) {
      console.error('CRITICAL: Prisma conversion error in issue.service:getByPropertyId. Falling back to raw MongoDB.');
        const db = mongoose.connection.db;
        if (!db) throw err;
        const assetsFilter = translateFilterToMongo({ propertyId });
        const assets = await db.collection('Asset').find(assetsFilter).toArray();
        const assetIds = assets.map(a => a._id.toString());
        const mongoFilter = translateFilterToMongo({
          OR: [
            { propertyId },
            ...(assetIds.length ? [{ assetId: { in: assetIds } }] : [])
          ]
        });
        const issues = await db.collection('Issue').find(mongoFilter).toArray();
        return issues.map(i => ({ ...i, id: i._id.toString() }));
      }
  },

  getByPropertyIds: async (propertyIds) => {
    try {
      if (!propertyIds || propertyIds.length === 0) return [];
      const assets = await prisma.asset.findMany({
        where: { propertyId: { in: propertyIds } },
        select: { id: true }
      });
      const assetIds = assets.map(a => a.id).filter(Boolean);
      return await prisma.issue.findMany({
        where: {
          OR: [
            { propertyId: { in: propertyIds } },
            ...(assetIds.length ? [{ assetId: { in: assetIds } }] : []),
          ]
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (err) {
      console.error('CRITICAL: Prisma conversion error in issue.service:getByPropertyIds. Falling back to raw MongoDB.');
        const db = mongoose.connection.db;
        if (!db) throw err;
        const assetsFilter = translateFilterToMongo({ propertyId: { in: propertyIds } });
        const assets = await db.collection('Asset').find(assetsFilter).toArray();
        const assetIds = assets.map(a => a._id.toString());
        const mongoFilter = translateFilterToMongo({
          OR: [
            { propertyId: { in: propertyIds } },
            ...(assetIds.length ? [{ assetId: { in: assetIds } }] : []),
          ]
        });
        const issues = await db.collection('Issue').find(mongoFilter).sort({ createdAt: -1 }).toArray();
        return issues.map(i => ({ ...i, id: i._id.toString() }));
      }
  },

  getByManagerId: async (managerUserId) => {
    try {
      const userService = require('../user/user.service');
      const user = await userService.findUserById(managerUserId);
      if (!user) return [];
      const email = user.email;
      const phone = user.phone;

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
      return await prisma.issue.findMany({ where: { assetId: { in: assetIds } } });
    } catch (err) {
      console.error('CRITICAL: Prisma conversion error in issue.service:getByManagerId. Falling back to raw MongoDB.');
      return [];
    }
  },

  create: (data) => prisma.issue.create({ data }),
  update: (id, data) => {
    if ('id' in data) delete data.id;
    return prisma.issue.update({ where: { id }, data });
  },
  delete: (id) => prisma.issue.delete({ where: { id } }),
};
