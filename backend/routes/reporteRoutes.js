const express = require('express');
const router = express.Router();
const reporteController = require('../controllers/reporteController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.use(verifyToken);

router.get('/datos', reporteController.getReporteData);
router.get('/exportar/excel', reporteController.exportarExcel);
router.get('/exportar/pdf', reporteController.exportarPDF);

module.exports = router;
