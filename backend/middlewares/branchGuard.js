/**
 * Middleware para garantizar el aislamiento estricto por sucursal_id
 * - Vendedor: Sólo puede consultar y operar datos de su propia sucursal asignada.
 * - Admin: Acceso global y puede alternar entre sucursales mediante query, body o header.
 */
function branchGuard(options = { allowAdminGlobal: true }) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }

    const { rol, sucursal_id: userSucursalId } = req.user;

    // Si es Vendedor: Forzar estrictamente su sucursal_id
    if (rol === 'vendedor') {
      if (!userSucursalId) {
        return res.status(403).json({
          success: false,
          error: 'El vendedor no tiene una sucursal asignada en el sistema'
        });
      }

      // Si intentó enviar otro sucursal_id en body o query, bloquear intento
      const paramSucursalId = req.query?.sucursal_id || req.body?.sucursal_id || req.headers?.['x-sucursal-id'];
      if (paramSucursalId && parseInt(paramSucursalId, 10) !== parseInt(userSucursalId, 10)) {
        return res.status(403).json({
          success: false,
          error: 'Acceso denegado: No tiene permisos para consultar o modificar datos de otra sucursal',
          tuSucursalId: userSucursalId
        });
      }

      req.sucursalId = parseInt(userSucursalId, 10);
      return next();
    }

    // Si es Administrador:
    if (rol === 'admin') {
      const targetSucursalId = req.query?.sucursal_id || req.body?.sucursal_id || req.headers?.['x-sucursal-id'];
      if (targetSucursalId === 'todas' || targetSucursalId === 'null' || !targetSucursalId) {
        req.sucursalId = options.allowAdminGlobal ? null : 1;
      } else {
        const parsed = parseInt(targetSucursalId, 10);
        req.sucursalId = isNaN(parsed) ? (options.allowAdminGlobal ? null : 1) : parsed;
      }
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Rol de usuario desconocido'
    });
  };
}

module.exports = {
  branchGuard
};
