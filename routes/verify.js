const router = require('express').Router();
const c = require('../controllers/verifyController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);
router.post('/manual', c.manual);
router.post('/qr', c.qr);
router.post('/upload', c.upload);
module.exports = router;
