const router = require('express').Router();
const c = require('../controllers/statsController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, c.stats);
module.exports = router;
