const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  create: (data) => {
    const payload = { ...data };
    // Merge building/block into the location JSON field if provided
    let location = payload.location ? { ...payload.location } : {};
    let hadLocation = !!payload.location;
    if (Object.prototype.hasOwnProperty.call(payload, 'building')) {
      if (payload.building !== undefined && payload.building !== null && payload.building !== '') {
        location.building = payload.building;
      }
      delete payload.building;
      hadLocation = true;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'blocks')) {
      if (payload.blocks !== undefined && payload.blocks !== null && payload.blocks !== '') {
        location.block = payload.blocks;
      }
      delete payload.blocks;
      hadLocation = true;
    } else if (Object.prototype.hasOwnProperty.call(payload, 'block')) {
      if (payload.block !== undefined && payload.block !== null && payload.block !== '') {
        location.block = payload.block;
      }
      delete payload.block;
      hadLocation = true;
    }

    const dataToCreate = { ...payload, quantity: payload.quantity ?? 1 };
    // defensive cleanup: remove any top-level fields that don't exist on the Prisma model
    delete dataToCreate.block;
    delete dataToCreate.blocks;
    delete dataToCreate.building;
    if (hadLocation) dataToCreate.location = location;
    // propertyId should be present as a string
    return prisma.asset.create({ data: dataToCreate });
  },
  findAll: (filter = {}) => prisma.asset.findMany({ where: filter, include: { property: true, spareParts: true } }),
  findById: (id) => prisma.asset.findUnique({ where: { id }, include: { property: true, spareParts: true, movements: true } }),
  update: async (id, data) => {
    const payload = { ...data };
    const rel = {};
    if (Object.prototype.hasOwnProperty.call(payload, 'propertyId')) {
      if (payload.propertyId) {
        rel.property = { connect: { id: payload.propertyId } };
      } else {
        // disconnect if null/empty supplied
        rel.property = { disconnect: true };
      }
      delete payload.propertyId;
    }

    // Merge building/block into the location JSON field for updates
    let location = payload.location ? { ...payload.location } : {};
    let hadLocation = false;
    if (Object.prototype.hasOwnProperty.call(payload, 'building')) {
      if (payload.building !== undefined && payload.building !== null && payload.building !== '') {
        location.building = payload.building;
      }
      delete payload.building;
      hadLocation = true;
    }
    // Handle incoming blocks: allow merging with existing blocks unless _replaceBlocks === true
    let incomingBlocks = null;
    if (Object.prototype.hasOwnProperty.call(payload, 'blocks')) {
      if (payload.blocks !== undefined && payload.blocks !== null && payload.blocks !== '') {
        incomingBlocks = payload.blocks;
      }
      delete payload.blocks;
      hadLocation = true;
    } else if (Object.prototype.hasOwnProperty.call(payload, 'block')) {
      if (payload.block !== undefined && payload.block !== null && payload.block !== '') {
        incomingBlocks = payload.block;
      }
      delete payload.block;
      hadLocation = true;
    }

    // support explicit removal list
    let removeBlocks = null;
    if (Object.prototype.hasOwnProperty.call(payload, 'removeBlocks')) {
      removeBlocks = payload.removeBlocks;
      delete payload.removeBlocks;
      hadLocation = true;
    }

    // If incomingBlocks exists and we are not replacing, merge with existing asset blocks
    if (incomingBlocks !== null) {
      // normalize incoming to array of strings
      const incomingArr = Array.isArray(incomingBlocks) ? incomingBlocks : [incomingBlocks];
      const incomingNorm = incomingArr.map(String).map(s => s.trim()).filter(Boolean);
      // fetch existing asset to merge
      try {
        const existing = await prisma.asset.findUnique({ where: { id } });
        let existingBlocks = [];
        if (existing && existing.location) {
          const eloc = existing.location;
          if (eloc && eloc.block) {
            if (Array.isArray(eloc.block)) existingBlocks = eloc.block.map(String);
            else existingBlocks = String(eloc.block).split(/[;,|]/).map(s => s.trim()).filter(Boolean);
          }
        }
        // if caller set _replaceBlocks true, replace, otherwise union
        const replace = !!payload._replaceBlocks;
        delete payload._replaceBlocks;
        let merged = [];
        if (replace) {
          merged = incomingNorm;
        } else {
          merged = Array.from(new Set([...(existingBlocks || []), ...incomingNorm]));
        }
        // handle removals
        if (removeBlocks) {
          const remArr = Array.isArray(removeBlocks) ? removeBlocks : [removeBlocks];
          const remNorm = remArr.map(String).map(s => s.trim()).filter(Boolean);
          merged = merged.filter(b => !remNorm.includes(String(b)));
        }
        location.block = merged;
      } catch (e) {
        // if anything goes wrong fetching existing, fall back to incoming
        location.block = Array.isArray(incomingBlocks) ? incomingBlocks : [incomingBlocks];
      }
    }

    const dataToUpdate = { ...payload, ...rel, quantity: payload.quantity ?? 1 };
    // defensive cleanup: remove any top-level fields that don't exist on the Prisma model
    delete dataToUpdate.block;
    delete dataToUpdate.blocks;
    delete dataToUpdate.building;
    if (hadLocation) dataToUpdate.location = location;
    return prisma.asset.update({ where: { id }, data: dataToUpdate });
  },
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