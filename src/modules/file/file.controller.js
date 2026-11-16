// Company-scoped CRUD: see utils/companyScopedController.js.
const service = require('./file.service');
const { createCompanyScopedController } = require('../../utils/companyScopedController');

module.exports = createCompanyScopedController(service, 'file');
