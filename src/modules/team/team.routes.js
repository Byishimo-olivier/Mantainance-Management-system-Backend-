
const express = require('express');
const ctrl = require('./team.controller');
const upload = require('../../middleware/upload');
const { authenticate, authorizeRoles } = require('../../middleware/auth.js');
const router = express.Router();

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
// accept one 'image' and multiple 'files' (attachments)
const teamUploadFields = upload.fields([
	{ name: 'image', maxCount: 1 },
	{ name: 'files', maxCount: 10 }
]);
router.post('/', authenticate, authorizeRoles('admin', 'manager', 'client'), teamUploadFields, ctrl.create);
router.put('/:id', authenticate, authorizeRoles('admin', 'manager', 'client'), teamUploadFields, ctrl.update);
router.delete('/:id', authenticate, authorizeRoles('admin', 'manager', 'client'), ctrl.delete);

module.exports = router;
