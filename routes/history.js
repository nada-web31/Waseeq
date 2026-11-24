const router = require('express').Router();
const c = require('../controllers/historyController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);
router.get('/', c.list);
router.get('/:id', c.get);
router.get('/:id/file', c.file);
router.patch('/:id/review', c.review);
router.delete('/:id', c.remove);
module.exports = router;
