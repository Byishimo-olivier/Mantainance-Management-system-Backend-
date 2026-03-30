const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const mongoose = require('mongoose');
const fallbackLogTimestamps = new Map();

const logPrismaFallback = (scope, err) => {
  const now = Date.now();
  const last = fallbackLogTimestamps.get(scope) || 0;
  if (now - last > 60000) {
    console.warn(`CRITICAL: Prisma conversion error in ${scope}. Falling back to raw MongoDB.`);
    if (err?.message) {
      console.warn(`[${scope}] ${err.message}`);
    }
    fallbackLogTimestamps.set(scope, now);
  }
};

const isNullUpdatedAtPrismaError = (err) => {
  const message = String(err?.message || '');
  return err?.code === 'P2032' && message.includes('"updatedAt"') && message.includes('found incompatible value of "null"');
};

const repairIssueUpdatedAtValues = async () => {
  const db = mongoose.connection.db;
  if (!db) return false;
  try {
    const result = await db.collection('Issue').updateMany(
      {
        $or: [
          { updatedAt: null },
          { updatedAt: { $exists: false } }
        ]
      },
      [
        {
          $set: {
            updatedAt: {
              $ifNull: ['$createdAt', '$$NOW']
            }
          }
        }
      ]
    );
    return (result.modifiedCount || 0) > 0;
  } catch (repairErr) {
    console.error('[issue.service] Failed to repair null updatedAt values:', repairErr.message || repairErr);
    return false;
  }
};

const applyCompanyFilter = (filter = {}, companyName) => {
  if (!companyName) return filter;
  return { ...filter, companyName };
};

const ISSUE_MUTABLE_FIELDS = new Set([
  'rejected',
  'rejectedAt',
  'rejectionReason',
  'companyName',
  'title',
  'description',
  'location',
  'propertyId',
  'assetId',
  'tags',
  'assignees',
  'overdue',
  'time',
  'photo',
  'userId',
  'anonId',
  'submissionType',
  'name',
  'email',
  'phone',
  'assignedTo',
  'inspectorId',
  'requestorId',
  'address',
  'beforeImage',
  'afterImage',
  'fixTime',
  'fixDeadline',
  'priority',
  'frequency',
  'status',
  'approved',
  'approvedAt',
  'resubmitted',
  'resubmittedAt',
  'resubmittedBy',
  'category',
  'assetName',
  'team',
  'additionalResponsibleWorkers',
  'checklist',
  'estimatedTime',
  'signature',
  'chat',
  'createdAt',
  'updatedAt'
]);

const normalizeDateValue = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const toCostNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(normalized) ? normalized : 0;
};

const summarizeIssueCosts = (issue = {}) => {
  const laborEntries = Array.isArray(issue.labor) ? issue.labor : Array.isArray(issue.laborEntries) ? issue.laborEntries : [];
  const partEntries = Array.isArray(issue.parts) ? issue.parts : Array.isArray(issue.materials) ? issue.materials : Array.isArray(issue.lineItems) ? issue.lineItems : [];
  const extraCostEntries = Array.isArray(issue.costs) ? issue.costs : Array.isArray(issue.additionalCosts) ? issue.additionalCosts : [];

  const laborFromEntries = laborEntries.reduce((sum, entry) => {
    if (entry?.cost !== undefined) return sum + toCostNumber(entry.cost);
    const rate = toCostNumber(entry?.rate ?? entry?.hourlyRate);
    const hours = toCostNumber(entry?.hours ?? entry?.time);
    const minutes = toCostNumber(entry?.minutes);
    const seconds = toCostNumber(entry?.seconds);
    return sum + (rate * (hours + (minutes / 60) + (seconds / 3600)));
  }, 0);

  const partsFromEntries = partEntries.reduce((sum, entry) => {
    const cost = toCostNumber(entry?.unitCost ?? entry?.cost ?? entry?.price);
    const quantity = toCostNumber(entry?.quantity ?? entry?.qty ?? 1) || 1;
    return sum + (cost * quantity);
  }, 0);

  const otherFromEntries = extraCostEntries.reduce((sum, entry) => sum + toCostNumber(entry?.cost ?? entry?.amount ?? entry?.value), 0);

  const laborCost = laborFromEntries || toCostNumber(issue?.laborCost ?? issue?.laborTotal ?? issue?.labor?.total ?? issue?.labor?.cost);
  const partsCost = partsFromEntries || toCostNumber(issue?.partsCost ?? issue?.materialsCost ?? issue?.totalPartsCost ?? issue?.parts?.total ?? issue?.itemsCost);
  const otherCost = otherFromEntries || toCostNumber(issue?.otherCost ?? issue?.miscCost ?? issue?.additionalCost);
  const totalCost = toCostNumber(issue?.totalCost ?? issue?.cost) || (laborCost + partsCost + otherCost);

  return {
    laborCost,
    partsCost,
    otherCost,
    totalCost,
  };
};

const COST_FIELD_NAMES = ['labor', 'laborEntries', 'parts', 'materials', 'lineItems', 'costs', 'additionalCosts'];

const mergeRawIssueCostFields = (issue = {}, rawIssue = null) => {
  if (!rawIssue) return issue;
  const merged = { ...issue };
  COST_FIELD_NAMES.forEach((field) => {
    if (merged[field] === undefined && rawIssue[field] !== undefined) {
      merged[field] = rawIssue[field];
    }
  });
  return merged;
};

const hydrateIssuesFromMongo = async (issues = []) => {
  if (!Array.isArray(issues) || issues.length === 0) return issues;
  const db = mongoose.connection.db;
  if (!db) return issues;
  const { ObjectId } = require('mongodb');
  const objectIds = issues
    .map((issue) => {
      const id = issue?.id || issue?._id;
      return (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : null;
    })
    .filter(Boolean);
  if (!objectIds.length) return issues;

  const rawIssues = await db.collection('Issue')
    .find({ _id: { $in: objectIds } }, { projection: COST_FIELD_NAMES.reduce((acc, field) => ({ ...acc, [field]: 1 }), {}) })
    .toArray();
  const rawMap = new Map(rawIssues.map((raw) => [String(raw._id), raw]));
  return issues.map((issue) => mergeRawIssueCostFields(issue, rawMap.get(String(issue?.id || issue?._id))));
};

const hydrateIssueFromMongo = async (issue) => {
  if (!issue) return issue;
  const [hydrated] = await hydrateIssuesFromMongo([issue]);
  return hydrated || issue;
};

const enrichIssueWithCosts = (issue) => {
  if (!issue) return issue;
  return {
    ...issue,
    ...summarizeIssueCosts(issue),
  };
};

const enrichIssuesWithCosts = async (issues = []) => {
  const hydrated = await hydrateIssuesFromMongo(issues);
  return hydrated.map(enrichIssueWithCosts);
};

const enrichSingleIssueWithCosts = async (issue) => enrichIssueWithCosts(await hydrateIssueFromMongo(issue));

const sanitizeIssueUpdateData = (data = {}) => {
  const cleaned = {};
  for (const [key, value] of Object.entries(data)) {
    if (ISSUE_MUTABLE_FIELDS.has(key)) cleaned[key] = value;
  }

  ['fixDeadline', 'approvedAt', 'rejectedAt', 'resubmittedAt', 'createdAt', 'updatedAt'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(cleaned, field)) {
      const normalized = normalizeDateValue(cleaned[field]);
      if (normalized === undefined) {
        delete cleaned[field];
      } else {
        cleaned[field] = normalized;
      }
    }
  });

  if (typeof cleaned.estimatedTime === 'string') {
    const parsed = parseFloat(cleaned.estimatedTime);
    cleaned.estimatedTime = Number.isNaN(parsed) ? undefined : parsed;
    if (cleaned.estimatedTime === undefined) delete cleaned.estimatedTime;
  }

  if (typeof cleaned.signature === 'boolean') {
    cleaned.signature = cleaned.signature ? 'true' : 'false';
  }

  return cleaned;
};

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
  getAll: async (companyName = null) => {
    try {
      const issues = await prisma.issue.findMany({ where: applyCompanyFilter({}, companyName) });
      return await enrichIssuesWithCosts(issues);
    } catch (err) {
      if (isNullUpdatedAtPrismaError(err)) {
        const repaired = await repairIssueUpdatedAtValues();
        if (repaired) {
          try {
            const issues = await prisma.issue.findMany({ where: applyCompanyFilter({}, companyName) });
            return await enrichIssuesWithCosts(issues);
          } catch (retryErr) {
            err = retryErr;
          }
        }
      }
      if (err.message.includes('userId') || err.message.includes('converting')) {
        logPrismaFallback('issue.service:getAll', err);
        const db = mongoose.connection.db;
        if (!db) throw err;
        const issues = await db.collection('Issue').find(applyCompanyFilter({}, companyName)).toArray();
        return await enrichIssuesWithCosts(issues.map(i => ({ ...i, id: i._id.toString() })));
      }
      throw err;
    }
  },

  getById: async (id) => {
    try {
      const issue = await prisma.issue.findUnique({ where: { id } });
      return await enrichSingleIssueWithCosts(issue);
    } catch (err) {
      if (isNullUpdatedAtPrismaError(err)) {
        const repaired = await repairIssueUpdatedAtValues();
        if (repaired) {
          try {
            const issue = await prisma.issue.findUnique({ where: { id } });
            return await enrichSingleIssueWithCosts(issue);
          } catch (retryErr) {
            err = retryErr;
          }
        }
      }
      if (err.message.includes('userId') || err.message.includes('converting')) {
        logPrismaFallback('issue.service:getById', err);
        const db = mongoose.connection.db;
        if (!db) throw err;
        const { ObjectId } = require('mongodb');
        const issue = await db.collection('Issue').findOne({ _id: new ObjectId(id) });
        return issue ? await enrichSingleIssueWithCosts({ ...issue, id: issue._id.toString() }) : null;
      }
      throw err;
    }
  },

  getByUserId: async (userId, companyName = null) => {
    try {
      const issues = await prisma.issue.findMany({ where: applyCompanyFilter({ userId }, companyName) });
      return await enrichIssuesWithCosts(issues);
    } catch (err) {
      if (isNullUpdatedAtPrismaError(err)) {
        const repaired = await repairIssueUpdatedAtValues();
        if (repaired) {
          try {
            const issues = await prisma.issue.findMany({ where: applyCompanyFilter({ userId }, companyName) });
            return await enrichIssuesWithCosts(issues);
          } catch (retryErr) {
            err = retryErr;
          }
        }
      }
      if (err.message.includes('userId') || err.message.includes('converting')) {
        logPrismaFallback('issue.service:getByUserId', err);
        const db = mongoose.connection.db;
        if (!db) throw err;
        const mongoFilter = translateFilterToMongo(applyCompanyFilter({ userId }, companyName));
        const issues = await db.collection('Issue').find(mongoFilter).toArray();
        return await enrichIssuesWithCosts(issues.map(i => ({ ...i, id: i._id.toString() })));
      }
      throw err;
    }
  },

  getByAssignedTech: async (techId, companyName = null) => {
    try {
      // Primary Prisma query (protected)
      const issues = await prisma.issue.findMany({
        where: applyCompanyFilter({ OR: [{ assignedTo: techId }] }, companyName)
      });
      // Filter for assignees.id match in JS (Prisma limitation with JSON arrays)
      const allIssues = await prisma.issue.findMany({ where: applyCompanyFilter({}, companyName) });
      const withAssignee = allIssues.filter(issue => Array.isArray(issue.assignees) && issue.assignees.some(a => a && a.id === techId));
      const merged = [...issues, ...withAssignee.filter(i => !issues.some(j => j.id === i.id))];
      return await enrichIssuesWithCosts(merged);
    } catch (err) {
      if (isNullUpdatedAtPrismaError(err)) {
        const repaired = await repairIssueUpdatedAtValues();
        if (repaired) {
          try {
            const issues = await prisma.issue.findMany({
              where: applyCompanyFilter({ OR: [{ assignedTo: techId }] }, companyName)
            });
            const allIssues = await prisma.issue.findMany({ where: applyCompanyFilter({}, companyName) });
            const withAssignee = allIssues.filter(issue => Array.isArray(issue.assignees) && issue.assignees.some(a => a && a.id === techId));
            const merged = [...issues, ...withAssignee.filter(i => !issues.some(j => j.id === i.id))];
            return await enrichIssuesWithCosts(merged);
          } catch (retryErr) {
            err = retryErr;
          }
        }
      }
      logPrismaFallback('issue.service:getByAssignedTech', err);
      const db = mongoose.connection.db;
      if (!db) throw err;
      const issues = await db.collection('Issue').find(applyCompanyFilter({
        $or: [
          { assignedTo: techId },
          { "assignees.id": techId }
        ]
      }, companyName)).toArray();
      return await enrichIssuesWithCosts(issues.map(i => ({ ...i, id: i._id.toString() })));
    }
  },

  getByTechnicianProperties: async (techUserId, companyName = null) => {
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
      // Exclude anonymous (submissionType === 'request') issues that have NOT been resubmitted.
      // Managers should only see authenticated submissions or anonymous ones that the client has resubmitted.
      const issues = await prisma.issue.findMany({
        where: applyCompanyFilter({
          AND: [
            { assetId: { in: assetIds } },
            { OR: [ { submissionType: { not: 'request' } }, { resubmitted: true } ] }
          ]
        }, companyName)
      });
      return await enrichIssuesWithCosts(issues);
    } catch (err) {
      if (isNullUpdatedAtPrismaError(err)) {
        await repairIssueUpdatedAtValues();
      }
      logPrismaFallback('issue.service:getByTechnicianProperties', err);
      const db = mongoose.connection.db;
      if (!db) throw err;
      // Fallback logic using raw MongoDB
      return []; // For now return empty on failure, but data is safe
    }
  },

  getByPropertyId: async (propertyId, companyName = null) => {
    try {
      const assets = await prisma.asset.findMany({ where: { propertyId }, select: { id: true } });
      const assetIds = assets.map(a => a.id).filter(Boolean);
      const issues = await prisma.issue.findMany({
        where: applyCompanyFilter({
          OR: [
            { propertyId },
            ...(assetIds.length ? [{ assetId: { in: assetIds } }] : []),
          ]
        }, companyName)
      });
      return await enrichIssuesWithCosts(issues);
    } catch (err) {
      if (isNullUpdatedAtPrismaError(err)) {
        const repaired = await repairIssueUpdatedAtValues();
        if (repaired) {
          try {
            const assets = await prisma.asset.findMany({ where: { propertyId }, select: { id: true } });
            const assetIds = assets.map(a => a.id).filter(Boolean);
            const issues = await prisma.issue.findMany({
              where: applyCompanyFilter({
                OR: [
                  { propertyId },
                  ...(assetIds.length ? [{ assetId: { in: assetIds } }] : []),
                ]
              }, companyName)
            });
            return await enrichIssuesWithCosts(issues);
          } catch (retryErr) {
            err = retryErr;
          }
        }
      }
      logPrismaFallback('issue.service:getByPropertyId', err);
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
        const issues = await db.collection('Issue').find(applyCompanyFilter(mongoFilter, companyName)).toArray();
        return await enrichIssuesWithCosts(issues.map(i => ({ ...i, id: i._id.toString() })));
      }
  },

  getByPropertyIds: async (propertyIds, companyName = null) => {
    try {
      if (!propertyIds || propertyIds.length === 0) return [];
      const assets = await prisma.asset.findMany({
        where: { propertyId: { in: propertyIds } },
        select: { id: true }
      });
      const assetIds = assets.map(a => a.id).filter(Boolean);
      const issues = await prisma.issue.findMany({
        where: applyCompanyFilter({
          OR: [
            { propertyId: { in: propertyIds } },
            ...(assetIds.length ? [{ assetId: { in: assetIds } }] : []),
          ]
        }, companyName),
        orderBy: { createdAt: 'desc' }
      });
      return await enrichIssuesWithCosts(issues);
    } catch (err) {
      if (isNullUpdatedAtPrismaError(err)) {
        const repaired = await repairIssueUpdatedAtValues();
        if (repaired) {
          try {
            const assets = await prisma.asset.findMany({
              where: { propertyId: { in: propertyIds } },
              select: { id: true }
            });
            const assetIds = assets.map(a => a.id).filter(Boolean);
            const issues = await prisma.issue.findMany({
              where: applyCompanyFilter({
                OR: [
                  { propertyId: { in: propertyIds } },
                  ...(assetIds.length ? [{ assetId: { in: assetIds } }] : []),
                ]
              }, companyName),
              orderBy: { createdAt: 'desc' }
            });
            return await enrichIssuesWithCosts(issues);
          } catch (retryErr) {
            err = retryErr;
          }
        }
      }
      logPrismaFallback('issue.service:getByPropertyIds', err);
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
        const issues = await db.collection('Issue').find(applyCompanyFilter(mongoFilter, companyName)).sort({ createdAt: -1 }).toArray();
        return await enrichIssuesWithCosts(issues.map(i => ({ ...i, id: i._id.toString() })));
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
      const issues = await prisma.issue.findMany({ where: { assetId: { in: assetIds } } });
      return await enrichIssuesWithCosts(issues);
    } catch (err) {
      if (isNullUpdatedAtPrismaError(err)) {
        await repairIssueUpdatedAtValues();
      }
      logPrismaFallback('issue.service:getByManagerId', err);
      return [];
    }
  },

  create: async (data) => {
    const d = { ...data };
    if (d.assetId) {
      d.asset = { connect: { id: d.assetId } };
      delete d.assetId;
    }
    if (d.propertyId) {
      d.property = { connect: { id: d.propertyId } };
      delete d.propertyId;
    }
    // Ensure assignees JSON is provided (Prisma requires the field)
    try {
      if (typeof d.assignees === 'string') {
        d.assignees = JSON.parse(d.assignees);
      }
    } catch (e) {
      d.assignees = [];
    }
    if (!Object.prototype.hasOwnProperty.call(d, 'assignees') || d.assignees === undefined || d.assignees === null) {
      d.assignees = [];
    }
    // Ensure required `time` field exists (Prisma schema requires it)
    try {
      if (d.time === undefined || d.time === null || d.time === '') {
        d.time = new Date().toISOString();
      } else if (typeof d.time !== 'string') {
        d.time = String(d.time);
      }
    } catch (e) {
      d.time = new Date().toISOString();
    }
    // Extract files (Prisma Issue model doesn't have `files` field)
    const filesArray = Array.isArray(d.files) ? d.files : (d.files ? [d.files] : []);
    if (Object.prototype.hasOwnProperty.call(d, 'files')) delete d.files;

    const created = await prisma.issue.create({ data: d });

    // If files were provided, persist them directly into Mongo (avoids Prisma schema change)
    if (filesArray && filesArray.length) {
      try {
        const db = mongoose.connection.db;
        const { ObjectId } = require('mongodb');
        await db.collection('Issue').updateOne({ _id: new ObjectId(created.id) }, { $set: { files: filesArray } });
        // attach to returned object for callers
        created.files = filesArray;
      } catch (e) {
        console.error('Error persisting files to Mongo after Prisma create:', e);
      }
    }

    return created;
  },
  update: (id, data) => {
    const d = sanitizeIssueUpdateData({ ...data });
    if ('id' in d) delete d.id;
    if (Object.prototype.hasOwnProperty.call(d, 'assetId')) {
      if (d.assetId === null) {
        d.asset = { disconnect: true };
      } else {
        d.asset = { connect: { id: d.assetId } };
      }
      delete d.assetId;
    }
    if (Object.prototype.hasOwnProperty.call(d, 'propertyId')) {
      if (d.propertyId === null) {
        d.property = { disconnect: true };
      } else {
        d.property = { connect: { id: d.propertyId } };
      }
      delete d.propertyId;
    }
    return prisma.issue.update({ where: { id }, data: d });
  },
  getLinks: async (id) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const issue = await db.collection('Issue').findOne({ _id: objectId }, { projection: { links: 1 } });
    return Array.isArray(issue?.links) ? issue.links : [];
  },
  addLink: async (id, link) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const entry = {
      id: link?.id || `link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...link,
      createdAt: link?.createdAt || new Date().toISOString()
    };
    await db.collection('Issue').updateOne(
      { _id: objectId },
      { $push: { links: entry }, $set: { updatedAt: new Date() } }
    );
    return entry;
  },
  removeLink: async (id, linkId) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const issue = await db.collection('Issue').findOne({ _id: objectId }, { projection: { links: 1 } });
    const existing = Array.isArray(issue?.links) ? issue.links : [];
    const nextLinks = existing.filter((entry) => String(entry?.id || entry?._id || '') !== String(linkId));
    await db.collection('Issue').updateOne(
      { _id: objectId },
      { $set: { links: nextLinks, updatedAt: new Date() } }
    );
    return { removed: existing.length !== nextLinks.length };
  },
  getFiles: async (id) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const issue = await db.collection('Issue').findOne({ _id: objectId }, { projection: { files: 1 } });
    return Array.isArray(issue?.files) ? issue.files : [];
  },
  addFiles: async (id, files) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const entries = Array.isArray(files) ? files : [];
    if (!entries.length) return [];
    await db.collection('Issue').updateOne(
      { _id: objectId },
      { $push: { files: { $each: entries } }, $set: { updatedAt: new Date() } }
    );
    return entries;
  },
  getActivity: async (id) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const issue = await db.collection('Issue').findOne({ _id: objectId }, { projection: { activity: 1 } });
    return Array.isArray(issue?.activity) ? issue.activity : [];
  },
  addActivity: async (id, entry) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const payload = {
      id: entry?.id || `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...entry,
      timestamp: entry?.timestamp || new Date().toISOString()
    };
    await db.collection('Issue').updateOne(
      { _id: objectId },
      { $push: { activity: payload }, $set: { updatedAt: new Date() } }
    );
    return payload;
  },
  getCosts: async (id) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const issue = await db.collection('Issue').findOne({ _id: objectId }, { projection: { costs: 1 } });
    return Array.isArray(issue?.costs) ? issue.costs : [];
  },
  addCost: async (id, entry) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const payload = {
      id: entry?.id || `cost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...entry,
      createdAt: entry?.createdAt || new Date().toISOString()
    };
    await db.collection('Issue').updateOne(
      { _id: objectId },
      { $push: { costs: payload }, $set: { updatedAt: new Date() } }
    );
    return payload;
  },
  getParts: async (id) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const issue = await db.collection('Issue').findOne({ _id: objectId }, { projection: { parts: 1 } });
    return Array.isArray(issue?.parts) ? issue.parts : [];
  },
  addPart: async (id, entry) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const payload = {
      id: entry?.id || `part-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...entry,
      createdAt: entry?.createdAt || new Date().toISOString()
    };
    await db.collection('Issue').updateOne(
      { _id: objectId },
      { $push: { parts: payload }, $set: { updatedAt: new Date() } }
    );
    return payload;
  },
  getLabor: async (id) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const issue = await db.collection('Issue').findOne({ _id: objectId }, { projection: { labor: 1 } });
    return Array.isArray(issue?.labor) ? issue.labor : [];
  },
  addLabor: async (id, entry) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const payload = {
      id: entry?.id || `labor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...entry,
      createdAt: entry?.createdAt || new Date().toISOString()
    };
    await db.collection('Issue').updateOne(
      { _id: objectId },
      { $push: { labor: payload }, $set: { updatedAt: new Date() } }
    );
    return payload;
  },
  getProviderPortal: async (id) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const issue = await db.collection('Issue').findOne({ _id: objectId }, { projection: { providerPortalEnabled: 1, providerPortalUrl: 1 } });
    return {
      providerPortalEnabled: Boolean(issue?.providerPortalEnabled),
      providerPortalUrl: issue?.providerPortalUrl || ''
    };
  },
  updateProviderPortal: async (id, payload) => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const { ObjectId } = require('mongodb');
    const objectId = (typeof id === 'string' && ObjectId.isValid(id)) ? new ObjectId(id) : id;
    const update = {
      providerPortalEnabled: Boolean(payload?.providerPortalEnabled),
      providerPortalUrl: payload?.providerPortalUrl || '',
      updatedAt: new Date()
    };
    await db.collection('Issue').updateOne({ _id: objectId }, { $set: update });
    return update;
  },
  delete: (id) => prisma.issue.delete({ where: { id } }),
};
