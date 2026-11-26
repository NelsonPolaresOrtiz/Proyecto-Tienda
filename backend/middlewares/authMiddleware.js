const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');

/**
 * Middleware para validar el JWT desde Cookies HttpOnly o Header Authorization Bearer
 */
function verifyToken(req, res, next) {
  let token = null;

  // 1. Intentar obtener desde cookies HttpOnly
  if (req.cookies && req.cookies[jwtConfig.cookieName]) {
    token = req.cookies[jwtConfig.cookieName];
  } 
  // 2. Intentar obtener desde header Authorization Bearer
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Acceso no autorizado. Debe iniciar sesión'
    });
  }

  try {
    const decoded = jwt.verify(token, jwtConfig.secret);
    req.user = decoded;
    next();
  } catch (error) {
    // Si el token expiró o es inválido, limpiar cookie
    res.clearCookie(jwtConfig.cookieName);
    return res.status(401).json({
      success: false,
      error: 'Sesión expirada o token inválido. Por favor, vuelva a iniciar sesión'
    });
  }
}

/**
 * Middleware para restringir acceso por rol (ej: 'admin', 'vendedor')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }

    if (!allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        error: `Acceso denegado: El rol '${req.user.rol}' no tiene permisos para esta operación`,
        requiredRoles: allowedRoles
      });
    }

    next();
  };
}

/**
 * Helper para verificar token de forma silenciosa (usado en vistas web)
 */
function extractUserFromRequest(req) {
  let token = null;
  if (req.cookies && req.cookies[jwtConfig.cookieName]) {
    token = req.cookies[jwtConfig.cookieName];
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return null;

  try {
    return jwt.verify(token, jwtConfig.secret);
  } catch (e) {
    return null;
  }
}

module.exports = {
  verifyToken,
  requireRole,
  extractUserFromRequest
};
