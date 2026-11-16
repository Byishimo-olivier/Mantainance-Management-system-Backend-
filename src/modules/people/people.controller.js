// Company-scoped CRUD: see utils/companyScopedController.js.
const service = require('./people.service');
const { createCompanyScopedController } = require('../../utils/companyScopedController');

module.exports = createCompanyScopedController(service, 'people');
