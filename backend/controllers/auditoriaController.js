const auditoriaService = require('../services/auditoriaService');

class AuditoriaController {
  /**
   * GET /api/auditoria
   * Listar historial de actividades (Solo Admin)
   */
  async list(req, res, next) {
    try {
      const { usuario_id, sucursal_id, modulo, fecha_inicio, fecha_fin, busqueda, limit } = req.query;
      const actividades = await auditoriaService.getActividades({
        usuario_id,
        sucursal_id,
        modulo,
        fecha_inicio,
        fecha_fin,
        busqueda,
        limit
      });

      return res.status(200).json({
        success: true,
        total: actividades.length,
        data: actividades
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuditoriaController();
