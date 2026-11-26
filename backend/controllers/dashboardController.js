const dashboardService = require('../services/dashboardService');

class DashboardController {
  async getResumen(req, res, next) {
    try {
      const user = req.user;
      let targetSucursal = req.query.sucursal_id;

      // Si es vendedor, sólo puede ver datos de su propia sucursal
      if (user.rol === 'vendedor') {
        targetSucursal = user.sucursal_id;
      }

      const data = await dashboardService.getDashboardData(targetSucursal);

      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DashboardController();
