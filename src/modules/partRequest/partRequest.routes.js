const express = require('express');
const controller = require('./partRequest.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

// List all part requests
router.get('/', authenticate, controller.list);

// Create new part request
router.post('/', authenticate, controller.create);

// Get specific part request
router.get('/:id', authenticate, controller.getById);

// Update part request (notes, reason)
router.put('/:id', authenticate, controller.update);

// Approve a part request
router.put('/:id/approve', authenticate, controller.approve);

// Decline a part request
router.put('/:id/decline', authenticate, controller.decline);

// Record who allocated the part
router.put('/:id/record-allocated', authenticate, controller.recordAllocatedBy);

// Record who gave the part
router.put('/:id/record-given', authenticate, controller.recordGivenBy);

// Record who received the part
router.put('/:id/record-received', authenticate, controller.recordReceivedBy);

// Mark as fulfilled
router.put('/:id/fulfill', authenticate, controller.fulfill);

// Cancel a part request
router.put('/:id/cancel', authenticate, controller.cancel);

// Delete a part request
router.delete('/:id', authenticate, controller.delete);

module.exports = router;
