const authService = require('../services/authService');
const auditoriaService = require('../services/auditoriaService');
const { registrarAuditoria } = require('../utils/auditoriaHelper');
const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');

class AuthController {
  /**
   * POST /api/auth/login
   * Inicio de sesión con JWT y Cookie HttpOnly
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Debe ingresar su correo y contraseña'
        });
      }

      const result = await authService.login(email, password);

      // Registrar en auditoría
      const ambito = result.user.rol === 'admin' ? 'Administración Global' : result.user.sucursal_nombre;
      await registrarAuditoria(
        result.user.id,
        result.user.sucursal_id,
        'Login',
        'Inicio de sesión',
        `Inició sesión en el sistema (${ambito})`,
        req
      );

      // Guardar token en Cookie HttpOnly para máxima seguridad
      res.cookie(jwtConfig.cookieName, result.token, jwtConfig.cookieOptions);

      // Responder con datos del usuario y URL de redirección
      return res.status(200).json({
        success: true,
        message: `Bienvenido(a), ${result.user.nombre}`,
        token: result.token,
        user: result.user,
        redirectUrl: result.redirectUrl
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: error.message || 'Error al autenticar credenciales'
      });
    }
  }

  /**
   * POST /api/auth/logout
   * Cerrar sesión y limpiar cookies
   */
  async logout(req, res) {
    try {
      const authHeader = req.headers.authorization;
      const token = (authHeader && authHeader.startsWith('Bearer '))
        ? authHeader.split(' ')[1]
        : req.cookies?.[jwtConfig.cookieName];

      if (token) {
        const decoded = jwt.verify(token, jwtConfig.secret);
        if (decoded && decoded.id) {
          await registrarAuditoria(
            decoded.id,
            decoded.sucursal_id || null,
            'Login',
            'Cierre de sesión',
            'Cerró su sesión en el sistema',
            req
          );
        }
      }
    } catch (_) {
      // Ignorar errores de token expirado en logout
    }

    res.clearCookie(jwtConfig.cookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    return res.status(200).json({
      success: true,
      message: 'Sesión cerrada correctamente',
      redirectUrl: '/login.html'
    });
  }

  /**
   * GET /api/auth/me
   * Obtener perfil del usuario autenticado
   */
  async me(req, res, next) {
    try {
      const profile = await authService.getProfile(req.user.id);
      return res.status(200).json({
        success: true,
        user: {
          id: profile.id,
          nombre: profile.nombre,
          email: profile.email,
          rol: profile.rol,
          ci: profile.ci,
          telefono: profile.telefono,
          sucursal_id: profile.sucursal_id,
          sucursal_nombre: profile.sucursal_nombre || 'Acceso Global',
          sucursal_codigo: profile.sucursal_codigo || 'GLOBAL',
          es_matriz: profile.sucursal_es_matriz === 1,
          ultimo_login: profile.ultimo_login
        }
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/auth/check
   * Verificación rápida de sesión para ruteadores de frontend
   */
  async checkSession(req, res) {
    if (!req.user) {
      return res.status(200).json({
        authenticated: false
      });
    }

    const redirectUrl = req.user.rol === 'admin' ? '/dashboard.html' : '/pos.html';

    return res.status(200).json({
      authenticated: true,
      user: req.user,
      redirectUrl
    });
  }

  /**
   * GET /api/auth/mi-resumen
   * Resumen de actividad propia para Mi Perfil
   */
  async getMySummary(req, res, next) {
    try {
      const resumen = await auditoriaService.getResumenPerfil(req.user.id, req.user.rol, req.user.sucursal_id);
      return res.status(200).json({
        success: true,
        data: resumen
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/auth/mi-perfil
   * Actualizar teléfono WhatsApp propio
   */
  async updateMyProfile(req, res, next) {
    try {
      const updated = await authService.updateOwnProfile(req.user.id, req.body);
      await registrarAuditoria(
        req.user.id,
        req.user.sucursal_id || null,
        'Perfil',
        'Perfil actualizado',
        `Actualizó su teléfono de contacto / WhatsApp a: ${updated.telefono || 'Sin teléfono'}`,
        req
      );
      return res.status(200).json({
        success: true,
        message: 'Datos de perfil actualizados correctamente',
        user: {
          id: updated.id,
          nombre: updated.nombre,
          email: updated.email,
          rol: updated.rol,
          ci: updated.ci,
          telefono: updated.telefono,
          sucursal_id: updated.sucursal_id,
          sucursal_nombre: updated.sucursal_nombre || 'Acceso Global',
          sucursal_codigo: updated.sucursal_codigo || 'GLOBAL',
          es_matriz: updated.sucursal_es_matriz === 1,
          ultimo_login: updated.ultimo_login
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/auth/cambiar-password
   * Cambiar propia contraseña
   */
  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(req.user.id, currentPassword, newPassword);
      await registrarAuditoria(
        req.user.id,
        req.user.sucursal_id || null,
        'Perfil',
        'Cambio de contraseña',
        'Actualizó su contraseña personal de acceso',
        req
      );
      return res.status(200).json({
        success: true,
        message: 'Contraseña actualizada correctamente'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message || 'No se pudo cambiar la contraseña'
      });
    }
  }
}

module.exports = new AuthController();
