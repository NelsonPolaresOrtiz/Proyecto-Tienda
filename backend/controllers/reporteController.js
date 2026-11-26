const reporteService = require('../services/reporteService');

class ReporteController {
  /**
   * GET /api/reportes/datos
   * Obtener datos estructurados para la vista del módulo de reportes
   */
  async getReporteData(req, res, next) {
    try {
      const user = req.user;
      const query = { ...req.query };

      // Si es vendedor, forzar sucursal asignada
      if (user.rol === 'vendedor') {
        query.sucursal_id = user.sucursal_id;
      }

      const data = await reporteService.getReporteData(query);

      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/reportes/exportar/excel
   * Descarga de reporte formal en formato Excel (.xlsx)
   */
  async exportarExcel(req, res, next) {
    try {
      const user = req.user;
      const query = { ...req.query };

      if (user.rol === 'vendedor') {
        query.sucursal_id = user.sucursal_id;
      }

      const workbook = await reporteService.exportarExcel(query);

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `CandyBoom_Reporte_${query.periodo || 'periodo'}_${timestamp}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/reportes/exportar/pdf
   * Descarga de reporte formal en formato PDF
   */
  async exportarPDF(req, res, next) {
    try {
      const user = req.user;
      const query = { ...req.query };

      if (user.rol === 'vendedor') {
        query.sucursal_id = user.sucursal_id;
      }

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `CandyBoom_Reporte_${query.periodo || 'periodo'}_${timestamp}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      await reporteService.generarPDF(query, res);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReporteController();
