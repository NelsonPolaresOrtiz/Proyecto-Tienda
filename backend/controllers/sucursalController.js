const sucursalService = require('../services/sucursalService');
const { registrarAuditoria } = require('../utils/auditoriaHelper');

class SucursalController {
  /**
   * GET /api/sucursales
   * Listar todas las sucursales
   */
  async list(req, res, next) {
    try {
      const sucursales = await sucursalService.getAllSucursales(false);
      return res.status(200).json({
        success: true,
        data: sucursales
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/sucursales/:id
   * Obtener detalle de una sucursal
   */
  async getById(req, res, next) {
    try {
      const sucursal = await sucursalService.getSucursalById(req.params.id);
      return res.status(200).json({
        success: true,
        data: sucursal
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/sucursales
   * Crear nueva sucursal (Sólo Admin Global)
   */
  async create(req, res, next) {
    try {
      const nuevaSucursal = await sucursalService.createSucursal(req.body);
      await registrarAuditoria(
        req.user.id,
        nuevaSucursal.id,
        'Sucursales',
        'Sucursal creada',
        `Creó nueva sucursal "${nuevaSucursal.nombre}" (${nuevaSucursal.codigo}) en ${nuevaSucursal.ciudad}`,
        req
      );
      return res.status(201).json({
        success: true,
        message: `Sucursal ${nuevaSucursal.nombre} creada exitosamente`,
        data: nuevaSucursal
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/sucursales/:id
   * Actualizar sucursal (Sólo Admin Global)
   */
  async update(req, res, next) {
    try {
      const updated = await sucursalService.updateSucursal(req.params.id, req.body);
      await registrarAuditoria(
        req.user.id,
        updated.id,
        'Sucursales',
        'Sucursal actualizada',
        `Actualizó sucursal "${updated.nombre}" (${updated.codigo}) - Estado: ${updated.estado}`,
        req
      );
      return res.status(200).json({
        success: true,
        message: `Sucursal ${updated.nombre} actualizada exitosamente`,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/sucursales/resumen/dashboard
   * Resumen para el dashboard
   */
  async getDashboardSummary(req, res, next) {
    try {
      // Si el usuario es vendedor, solo puede ver su sucursal
      const targetSucursalId = req.user.rol === 'vendedor' 
        ? req.user.sucursal_id 
        : (req.query.sucursal_id ? parseInt(req.query.sucursal_id, 10) : null);

      const summary = await sucursalService.getDashboardSummary(targetSucursalId);
      return res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SucursalController();
