/**
 * Middleware centralizado de manejo de errores
 */
function errorHandler(err, req, res, next) {
  console.error('[Error Handler]:', err.stack || err.message);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * Middleware para rutas no encontradas (404)
 */
function notFoundHandler(req, res, next) {
  if (req.accepts('html')) {
    return res.status(404).redirect('/login.html');
  }
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.originalUrl}`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
