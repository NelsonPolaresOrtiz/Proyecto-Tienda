const { pool } = require('../config/db');

/**
 * Helper global de Auditoría de Actividades
 * Registra automáticamente cada operación crítica en auditoria_actividades
 */
async function registrarAuditoria(usuario_id, sucursal_id, modulo, accion, detalle, req = null) {
  try {
    if (!usuario_id) return;

    let ipEquipo = 'Sistema';
    if (req) {
      const forwarded = req.headers && req.headers['x-forwarded-for'];
      ipEquipo = forwarded
        ? String(forwarded).split(',')[0].trim()
        : (req.ip || req.socket?.remoteAddress || '127.0.0.1');
      if (ipEquipo === '::1') ipEquipo = '127.0.0.1';
      if (ipEquipo.startsWith('::ffff:')) ipEquipo = ipEquipo.replace('::ffff:', '');
    }

    const parsedSucursal = sucursal_id ? parseInt(sucursal_id, 10) : null;

    await pool.query(
      `INSERT INTO auditoria_actividades (usuario_id, sucursal_id, modulo, accion, detalle, ip_equipo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        usuario_id,
        parsedSucursal && !isNaN(parsedSucursal) ? parsedSucursal : null,
        String(modulo || 'General').slice(0, 60),
        String(accion || 'Actividad').slice(0, 100),
        String(detalle || ''),
        String(ipEquipo).slice(0, 60)
      ]
    );
  } catch (err) {
    console.error('[AuditoriaHelper Error]:', err.message);
  }
}

module.exports = {
  registrarAuditoria
};
