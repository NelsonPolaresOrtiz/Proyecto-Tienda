const express = require('express');
const router = express.Router();
const auditoriaController = require('../controllers/auditoriaController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

router.use(verifyToken);
router.use(requireRole('admin'));

router.get('/', auditoriaController.list);

module.exports = router;
