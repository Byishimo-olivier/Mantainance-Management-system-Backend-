const express = require('express');
const ctrl = require('./manager.controller');
const router = express.Router();

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.delete);

// Dashboard summary endpoint
router.get('/dashboard/summary', ctrl.dashboardSummary);

module.exports = router;
