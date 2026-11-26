const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

// Solo Administradores Globales pueden gestionar usuarios
router.use(verifyToken);
router.use(requireRole('admin'));

router.get('/', userController.list);
router.get('/:id', userController.getById);
router.post('/', userController.create);
router.put('/:id', userController.update);
router.patch('/:id/toggle-status', userController.toggleStatus);

module.exports = router;
