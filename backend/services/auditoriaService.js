const { pool } = require('../config/db');

class AuditoriaService {
  /**
   * Consultar historial de auditoría con filtros combinables (Solo Admin)
   */
  async getActividades(filters = {}) {
    const {
      usuario_id,
      sucursal_id,
      modulo,
      fecha_inicio,
      fecha_fin,
      busqueda,
      limit = 150
    } = filters;

    let sql = `
      SELECT a.id, a.usuario_id, a.sucursal_id, a.modulo, a.accion, a.detalle, a.ip_equipo, a.created_at,
             u.nombre AS usuario_nombre, u.email AS usuario_email, u.rol AS usuario_rol,
             COALESCE(s.nombre, 'Acceso Global') AS sucursal_nombre,
             s.codigo AS sucursal_codigo
      FROM auditoria_actividades a
      JOIN usuarios u ON a.usuario_id = u.id
      LEFT JOIN sucursales s ON a.sucursal_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (usuario_id && usuario_id !== 'todos') {
      sql += ` AND a.usuario_id = ?`;
      params.push(parseInt(usuario_id, 10));
    }

    if (sucursal_id && sucursal_id !== 'todas') {
      if (sucursal_id === 'global') {
        sql += ` AND a.sucursal_id IS NULL`;
      } else {
        sql += ` AND a.sucursal_id = ?`;
        params.push(parseInt(sucursal_id, 10));
      }
    }

    if (modulo && modulo !== 'todos') {
      sql += ` AND a.modulo = ?`;
      params.push(modulo);
    }

    if (fecha_inicio) {
      sql += ` AND DATE(a.created_at) >= ?`;
      params.push(fecha_inicio);
    }

    if (fecha_fin) {
      sql += ` AND DATE(a.created_at) <= ?`;
      params.push(fecha_fin);
    }

    if (busqueda && busqueda.trim()) {
      sql += ` AND (a.detalle LIKE ? OR a.accion LIKE ? OR u.nombre LIKE ?)`;
      const term = `%${busqueda.trim()}%`;
      params.push(term, term, term);
    }

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 150, 10), 500);
    sql += ` ORDER BY a.created_at DESC, a.id DESC LIMIT ?`;
    params.push(safeLimit);

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  /**
   * Obtener resumen de actividad propia para la pantalla Mi Perfil
   */
  async getResumenPerfil(usuarioId, rol, sucursalId) {
    // Ventas de hoy y de la semana realizadas por el usuario
    const [[ventasHoy]] = await pool.query(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto_total), 0) AS total_bs
       FROM ventas
       WHERE usuario_id = ? AND estado = 'completada' AND DATE(fecha_venta) = CURDATE()`,
      [usuarioId]
    );

    const [[ventasSemana]] = await pool.query(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto_total), 0) AS total_bs
       FROM ventas
       WHERE usuario_id = ? AND estado = 'completada' AND fecha_venta >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
      [usuarioId]
    );

    // Compras registradas por este usuario en los últimos 7 días
    const [[comprasSemana]] = await pool.query(
      `SELECT COUNT(*) AS cantidad
       FROM auditoria_actividades
       WHERE usuario_id = ? AND modulo = 'Compras' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
      [usuarioId]
    );

    // Estado de caja actual del usuario
    let cajaActual = null;
    if (sucursalId) {
      const [arqueos] = await pool.query(
        `SELECT id, monto_apertura, total_ventas_efectivo, total_ventas_qr, total_gastos, total_ingresos_extra, fecha_apertura, estado
         FROM arqueos_caja
         WHERE usuario_id = ? AND sucursal_id = ? AND estado = 'abierta'
         ORDER BY id DESC LIMIT 1`,
        [usuarioId, sucursalId]
      );
      if (arqueos.length > 0) {
        const a = arqueos[0];
        const esperado = parseFloat(a.monto_apertura || 0) + parseFloat(a.total_ventas_efectivo || 0) + parseFloat(a.total_ingresos_extra || 0) - parseFloat(a.total_gastos || 0);
        cajaActual = {
          abierta: true,
          id: a.id,
          fecha_apertura: a.fecha_apertura,
          efectivo_esperado: parseFloat(esperado.toFixed(2))
        };
      }
    }

    // Últimas 10 acciones propias
    const [ultimasActividades] = await pool.query(
      `SELECT a.id, a.modulo, a.accion, a.detalle, a.created_at, COALESCE(s.nombre, 'Global') AS sucursal_nombre
       FROM auditoria_actividades a
       LEFT JOIN sucursales s ON a.sucursal_id = s.id
       WHERE a.usuario_id = ?
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 10`,
      [usuarioId]
    );

    // Si es admin, estadísticas globales rápidas de auditoría
    let adminResumen = null;
    if (rol === 'admin') {
      const [[audHoy]] = await pool.query(
        `SELECT COUNT(*) AS total_hoy FROM auditoria_actividades WHERE DATE(created_at) = CURDATE()`
      );
      const [[cajerosActivos]] = await pool.query(
        `SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'vendedor' AND estado = 'activo'`
      );
      const [[cajasAbiertas]] = await pool.query(
        `SELECT COUNT(*) AS total FROM arqueos_caja WHERE estado = 'abierta'`
      );
      adminResumen = {
        accionesHoy: audHoy.total_hoy,
        cajerosActivos: cajerosActivos.total,
        cajasAbiertas: cajasAbiertas.total
      };
    }

    return {
      ventasHoy: {
        cantidad: ventasHoy.cantidad,
        total_bs: parseFloat(ventasHoy.total_bs || 0)
      },
      ventasSemana: {
        cantidad: ventasSemana.cantidad,
        total_bs: parseFloat(ventasSemana.total_bs || 0)
      },
      comprasSemana: comprasSemana.cantidad,
      cajaActual: cajaActual || { abierta: false },
      ultimasActividades,
      adminResumen
    };
  }
}

module.exports = new AuditoriaService();
