const  express= require ('express');
const authController = require('./auth.controller.js');

const router = express.Router();

router.post('/login', authController.login || authController);
router.get('/google/config', authController.getGoogleSsoConfig);
router.get('/google', authController.startGoogleSso);
router.get('/google/callback', authController.completeSso);
router.post('/sso/initiate', authController.initiateSso);
router.get('/sso/callback', authController.completeSso);

module.exports = router;
