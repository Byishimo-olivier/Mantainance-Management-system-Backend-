/**
 * Material Request Auto Purchase Order Service
 * Handles automatic PO generation when material requests are approved
 * if materials are not sufficiently in stock
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const Part = require('../part/part.model');

const normalizeLabel = (value) => String(value || '').trim().toLowerCase();

const getPartAvailableStock = (part) => {
  const directQty = Number(part?.available ?? part?.quantity ?? part?.onHand ?? 0);
  const lineQty = Array.isArray(part?.inventoryLines)
    ? part.inventoryLines.reduce((sum, line) => sum + (Number(line?.availQty || 0) || 0), 0)
    : 0;
  return Math.max(directQty, lineQty);
};

const getPartUnitCost = (part) => {
  if (Array.isArray(part?.inventoryLines) && part.inventoryLines.length > 0) {
    const lineWithCost = part.inventoryLines.find((line) => Number(line?.cost || 0) > 0);
    if (lineWithCost) return Number(lineWithCost.cost || 0);
  }
  return Number(part?.unitCost || 0);
};

const findInventoryPart = async (item, companyName = '') => {
  const materialId = String(item?.materialId || '').trim();
  if (!materialId) return null;

  if (/^[a-f\d]{24}$/i.test(materialId)) {
    const byId = await Part.findById(materialId).lean();
    if (byId) return byId;
  }

  const labels = [materialId, item?.title, item?.name, item?.partNumber]
    .map(normalizeLabel)
    .filter(Boolean);
  if (!labels.length) return null;

  const companyFilter = companyName
    ? { companyName: new RegExp(`^${companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    : {};
  const parts = await Part.find(companyFilter).lean();

  return parts.find((part) => {
    const partName = normalizeLabel(part?.name);
    const partNumber = normalizeLabel(part?.partNumber);
    const category = normalizeLabel(part?.category);
    return labels.some((label) => (
      label === partName ||
      label === partNumber ||
      label === category ||
      (partName && partName.includes(label)) ||
      (label && label.includes(partName))
    ));
  }) || null;
};

const findPrismaMaterial = async (materialId) => {
  if (!/^[a-f\d]{24}$/i.test(String(materialId || ''))) return null;
  return prisma.material.findUnique({ where: { id: materialId } });
};

/**
 * Check if material request items require purchase order
 * Compares requested quantities with available stock
 */
const checkStockRequirement = async (materialRequestId, options = {}) => {
  try {
    const request = await prisma.materialRequest.findUnique({
      where: { id: materialRequestId },
    });

    if (!request) {
      return { requiresPO: false, items: [], message: 'Request not found' };
    }

    // Get request items
    const items = await prisma.materialRequestItem.findMany({
      where: { materialRequestId }
    });

    if (!items || items.length === 0) {
      return { requiresPO: false, items: [], message: 'No items in request' };
    }

    // Check stock for each item
    const stockAnalysis = [];
    let requiresPO = false;

    for (const item of items) {
      const part = await findInventoryPart(item, options.companyName);
      const material = part ? null : await findPrismaMaterial(item.materialId);

      const quantityNeeded = item.quantity || 1;
      const availableStock = part ? getPartAvailableStock(part) : (material?.quantity || 0);
      const lowStockThreshold = Number(part?.minQtyThreshold ?? material?.lowStockThreshold ?? 0);
      const shortage = Math.max(0, quantityNeeded - availableStock);

      const analysis = {
        materialId: item.materialId,
        partId: part?._id ? String(part._id) : '',
        materialName: part?.name || material?.name || item.materialId,
        quantityNeeded,
        availableStock,
        lowStockThreshold,
        shortage,
        needsPurchase: shortage > 0 || availableStock <= lowStockThreshold,
        unitCost: part ? getPartUnitCost(part) : (material?.unitCost || 0),
        supplier: material?.supplier || ''
      };

      stockAnalysis.push(analysis);

      // If any item needs purchase, set requiresPO to true
      if (analysis.needsPurchase) {
        requiresPO = true;
      }
    }

    return {
      requiresPO,
      items: stockAnalysis,
      message: requiresPO ? 'PO required - stock insufficient' : 'Sufficient stock available'
    };
  } catch (err) {
    console.error('[checkStockRequirement] Error:', err);
    return { requiresPO: false, items: [], message: 'Error checking stock', error: err.message };
  }
};

/**
 * Get the best vendor for a material request
 * Uses the supplier from materials or falls back to most common supplier
 */
const getDefaultVendor = async (materialRequestId) => {
  try {
    // Get request items and materials
    const items = await prisma.materialRequestItem.findMany({
      where: { materialRequestId }
    });

    if (!items || items.length === 0) {
      return null;
    }

    // Get first material's supplier from legacy Material records when available.
    const firstMaterial = await findPrismaMaterial(items[0].materialId);

    if (firstMaterial?.supplier) {
      // Try to find vendor by name
      // Note: You may need to implement vendor search based on your schema
      return {
        name: firstMaterial.supplier,
        email: '' // Will need to be filled from contacts
      };
    }

    return null;
  } catch (err) {
    console.error('[getDefaultVendor] Error:', err);
    return null;
  }
};

/**
 * Calculate total PO amount for material request items
 */
const calculatePOTotal = (stockAnalysis) => {
  return stockAnalysis.reduce((total, item) => {
    const itemsToOrder = Math.max(item.shortage, 0);
    return total + (itemsToOrder * item.unitCost);
  }, 0);
};

/**
 * Prepare PO items from stock analysis
 */
const preparePOItems = (stockAnalysis) => {
  return stockAnalysis
    .filter(item => item.needsPurchase)
    .map(item => ({
      name: item.materialName,
      quantity: Math.max(item.shortage, 1),
      unitCost: item.unitCost,
      partId: item.partId || undefined,
      materialId: item.materialId,
      notes: `Auto-generated from material request. Stock: ${item.availableStock}/${item.quantityNeeded} needed`
    }));
};

/**
 * Auto-generate purchase order for approved material request if stock is low
 * Should be called after material request is approved by admin
 */
const autogeneratePOForApprovedRequest = async (materialRequestId, vendorInfo = {}) => {
  try {
    // Check if stock requires PO
    const stockCheck = await checkStockRequirement(materialRequestId, {
      companyName: vendorInfo.companyName || ''
    });

    if (!stockCheck.requiresPO) {
      return {
        success: true,
        poGenerated: false,
        message: 'Sufficient stock available - no PO needed',
        stockAnalysis: stockCheck.items
      };
    }

    // Get material request details
    const request = await prisma.materialRequest.findUnique({
      where: { id: materialRequestId }
    });

    if (!request) {
      return {
        success: false,
        message: 'Material request not found'
      };
    }

    // Prepare PO items
    const poItems = preparePOItems(stockCheck.items);
    const totalCost = calculatePOTotal(stockCheck.items);

    // Return PO data to be created (frontend will call purchase order creation with this data)
    return {
      success: true,
      poGenerated: false, // Indicates PO should be created
      requiresVendorSelection: true, // Frontend must select vendor
      stockAnalysis: stockCheck.items,
      suggestedPOData: {
        title: `Material Request ${request.requestId || materialRequestId.slice(-6)} - Auto-Generated PO`,
        items: poItems,
        totalCost,
        materialRequestId,
        issueId: request.issueId,
        workOrderId: request.workOrderId,
        source: 'MATERIAL_REQUEST_AUTO_APPROVAL',
        notes: `Automatically created because requested materials were insufficient in stock. Items: ${poItems.map(i => i.name).join(', ')}`,
        vendorId: vendorInfo.vendorId || '',
        vendor: vendorInfo.vendorName || '',
        vendorEmail: vendorInfo.vendorEmail || ''
      },
      message: 'PO must be created - stock insufficient'
    };
  } catch (err) {
    console.error('[autogeneratePOForApprovedRequest] Error:', err);
    return {
      success: false,
      message: 'Error generating PO',
      error: err.message
    };
  }
};

module.exports = {
  checkStockRequirement,
  getDefaultVendor,
  calculatePOTotal,
  preparePOItems,
  autogeneratePOForApprovedRequest
};
