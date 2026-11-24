const router = require('express').Router();
const c = require('../controllers/authController');
const { rateLimit } = require('../middleware/security');
const limiter = rateLimit(20, 15 * 60 * 1000);

router.post('/register', limiter, c.register);
router.post('/login', limiter, c.login);
router.post('/logout', c.logout);
router.get('/me', c.me);
module.exports = router;
