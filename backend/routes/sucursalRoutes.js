const express = require('express');
const router = express.Router();
const sucursalController = require('../controllers/sucursalController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Listar sucursales (vendedores y administradores)
router.get('/', sucursalController.list);

// Resumen para dashboard
router.get('/resumen/dashboard', sucursalController.getDashboardSummary);

// Detalle de sucursal
router.get('/:id', sucursalController.getById);

// Crear nueva sucursal (Sólo Administrador Global)
router.post('/', requireRole('admin'), sucursalController.create);

// Actualizar sucursal (Sólo Administrador Global)
router.put('/:id', requireRole('admin'), sucursalController.update);

module.exports = router;
