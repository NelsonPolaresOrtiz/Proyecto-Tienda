const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventarioController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

// Todas las rutas de inventario requieren autenticación
router.use(verifyToken);

// Catálogo, Categorías y Lotes
router.get('/catalogo', inventarioController.getCatalogo);
router.get('/categorias', inventarioController.getCategorias);
router.get('/lotes', inventarioController.getLotes);

// Panel de Inventario Operativo por Sucursal (KPIs, stock en cajas/unidades, costos y márgenes)
router.get('/sucursal/:id', inventarioController.getInventarioSucursal);

// Crear nuevo producto en catálogo maestro
router.post('/productos', inventarioController.createProduct);

// Gestión por producto en sucursal (Lotes, Precio/Oferta, Ajuste de Stock)
router.get('/sucursal/:sucursalId/productos/:productoId/lotes', inventarioController.getProductLots);
router.put('/sucursal/:sucursalId/productos/:productoId/precio-oferta', inventarioController.updatePriceOffer);
router.post('/sucursal/:sucursalId/productos/:productoId/ajuste-stock', inventarioController.adjustStock);

// Compras por Caja (Admin y Vendedor autorizado)
router.post('/compras', inventarioController.registerPurchase);

// Vencimientos y Ofertas
router.get('/vencimientos', inventarioController.getVencimientos);
router.get('/vencimientos/config-whatsapp', inventarioController.getConfigWhatsapp);
router.post('/vencimientos/config-whatsapp', requireRole('admin'), inventarioController.saveConfigWhatsapp);
router.post('/vencimientos/notificar-whatsapp', requireRole('admin'), inventarioController.notificarWhatsApp);
router.put('/lotes/:id/oferta', inventarioController.applyOffer);

// Traspasos entre sucursales
router.post('/traspasos', inventarioController.transferStock);
router.get('/traspasos', inventarioController.getTransfers);

module.exports = router;
