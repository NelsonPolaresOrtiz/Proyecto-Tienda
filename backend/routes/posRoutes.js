const express = require('express');
const router = express.Router();
const posController = require('../controllers/posController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { branchGuard } = require('../middlewares/branchGuard');

// Todas las rutas de POS requieren autenticación y aislamiento estricto por sucursal
router.use(verifyToken);
router.use(branchGuard({ allowAdminGlobal: false }));

// Catálogo de productos y categorías de la sucursal activa
router.get('/productos', posController.getProducts);
router.get('/categorias', posController.getCategories);

// Arqueo y control de caja
router.get('/saldo-anterior', posController.getSaldoAnterior);
router.get('/arqueo-activo', posController.getActiveCash);
router.post('/abrir-caja', posController.openCash);
router.post('/cerrar-caja', posController.closeCash);
router.get('/historial-arqueos', posController.getHistorialArqueos);

// Operaciones POS
router.post('/ventas', posController.processSale);
router.get('/gastos', posController.getExpenses);
router.post('/gastos', posController.addExpense);
router.post('/compras-cajas', posController.registerBoxPurchase);

module.exports = router;
