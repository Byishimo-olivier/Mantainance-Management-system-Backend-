const express = require('express');
const ctrl = require('./studio.controller');
const { authenticate, authorizeRoles } = require('../../middleware/auth');

const router = express.Router();
const admins = authorizeRoles('client', 'admin', 'manager', 'superadmin');
// Wrap async handlers so errors become a clean 500 instead of an unhandled rejection.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
  console.error('[Studio]', err);
  res.status(500).json({ error: 'Studio could not complete that action.' });
});

router.get('/automations/activity', authenticate, admins, ctrl.guard, wrap(ctrl.activity));
// Used by the app's screens (any signed-in user of the company)
router.get('/runtime/:target', authenticate, ctrl.guard, wrap(ctrl.runtime));
router.get('/values/:target/:recordId', authenticate, ctrl.guard, wrap(ctrl.getValues));
router.put('/values/:target/:recordId', authenticate, ctrl.guard, wrap(ctrl.putValues));
// Any signed-in company user may read what is published (forms and workflows the app uses).
router.get('/:kind/published', authenticate, ctrl.guard, wrap(ctrl.published));

router.get('/:kind', authenticate, admins, ctrl.guard, wrap(ctrl.list));
router.post('/:kind', authenticate, admins, ctrl.guard, wrap(ctrl.create));
router.put('/:kind/:id', authenticate, admins, ctrl.guard, wrap(ctrl.saveDraft));
router.post('/:kind/:id/publish', authenticate, admins, ctrl.guard, wrap(ctrl.publish));
router.post('/:kind/:id/rollback', authenticate, admins, ctrl.guard, wrap(ctrl.rollback));
router.post('/:kind/:id/unpublish', authenticate, admins, ctrl.guard, wrap(ctrl.unpublish));
router.delete('/:kind/:id', authenticate, admins, ctrl.guard, wrap(ctrl.remove));

module.exports = router;
