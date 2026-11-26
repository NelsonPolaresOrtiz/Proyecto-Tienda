const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');

// Rutas públicas
router.post('/login', authController.login);
router.post('/logout', authController.logout);

// Rutas protegidas
router.get('/me', verifyToken, authController.me);
router.get('/check', verifyToken, authController.checkSession);
router.get('/mi-resumen', verifyToken, authController.getMySummary);
router.put('/mi-perfil', verifyToken, authController.updateMyProfile);
router.put('/cambiar-password', verifyToken, authController.changePassword);

module.exports = router;
