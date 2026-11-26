const { pool } = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');

class AuthService {
  /**
   * Autenticar usuario por email y contraseña
   */
  async login(email, password) {
    if (!email || !password) {
      throw new Error('Debe proporcionar correo electrónico y contraseña');
    }

    // Buscar usuario en base de datos con sucursal
    const [users] = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.password, u.rol, u.sucursal_id, u.ci, u.telefono, u.estado,
              s.nombre AS sucursal_nombre, s.codigo AS sucursal_codigo, s.es_matriz AS sucursal_es_matriz
       FROM usuarios u
       LEFT JOIN sucursales s ON u.sucursal_id = s.id
       WHERE u.email = ? LIMIT 1`,
      [email.trim().toLowerCase()]
    );

    if (users.length === 0) {
      throw new Error('Credenciales inválidas. Verifique su correo o contraseña');
    }

    const user = users[0];

    // Verificar si el usuario está activo
    if (user.estado !== 'activo') {
      throw new Error('Esta cuenta de usuario se encuentra inactiva. Contacte a la administración');
    }

    // Si es vendedor, verificar que su sucursal esté activa
    if (user.rol === 'vendedor') {
      if (!user.sucursal_id) {
        throw new Error('El usuario vendedor no tiene una sucursal asignada');
      }
      const [sucursales] = await pool.query(
        `SELECT estado FROM sucursales WHERE id = ? LIMIT 1`,
        [user.sucursal_id]
      );
      if (sucursales.length === 0 || sucursales[0].estado !== 'activo') {
        throw new Error('La sucursal asignada a este vendedor se encuentra inactiva');
      }
    }

    // Comparar contraseña con bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Credenciales inválidas. Verifique su correo o contraseña');
    }

    // Actualizar último login
    await pool.query(
      `UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?`,
      [user.id]
    );

    // Definir redirección según rol
    const redirectUrl = user.rol === 'admin' ? '/dashboard.html' : '/pos.html';

    // Generar Payload JWT
    const tokenPayload = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      sucursal_id: user.sucursal_id,
      sucursal_nombre: user.sucursal_nombre || 'Todas las Sucursales (Matriz)',
      sucursal_codigo: user.sucursal_codigo || 'MATRIZ',
      es_matriz: user.sucursal_es_matriz === 1
    };

    const token = jwt.sign(tokenPayload, jwtConfig.secret, {
      expiresIn: jwtConfig.expiresIn
    });

    return {
      token,
      redirectUrl,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        ci: user.ci,
        telefono: user.telefono,
        sucursal_id: user.sucursal_id,
        sucursal_nombre: user.sucursal_nombre || 'Acceso Global (Todas)',
        sucursal_codigo: user.sucursal_codigo || 'GLOBAL',
        es_matriz: user.sucursal_es_matriz === 1
      }
    };
  }

  /**
   * Obtener perfil del usuario por ID
   */
  async getProfile(userId) {
    const [users] = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.sucursal_id, u.ci, u.telefono, u.estado, u.ultimo_login,
              s.nombre AS sucursal_nombre, s.codigo AS sucursal_codigo, s.es_matriz AS sucursal_es_matriz
       FROM usuarios u
       LEFT JOIN sucursales s ON u.sucursal_id = s.id
       WHERE u.id = ? LIMIT 1`,
      [userId]
    );

    if (users.length === 0) {
      throw new Error('Usuario no encontrado');
    }

    return users[0];
  }

  /**
   * Actualizar datos propios (ej. teléfono WhatsApp)
   */
  async updateOwnProfile(userId, { telefono }) {
    const cleanPhone = telefono !== undefined ? String(telefono).trim() : null;
    await pool.query(
      `UPDATE usuarios SET telefono = ? WHERE id = ?`,
      [cleanPhone, userId]
    );
    return this.getProfile(userId);
  }

  /**
   * Cambiar contraseña propia verificando la contraseña actual
   */
  async changePassword(userId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) {
      throw new Error('Debe ingresar su contraseña actual y la nueva contraseña');
    }
    if (String(newPassword).trim().length < 6) {
      throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
    }

    const [users] = await pool.query(`SELECT id, password FROM usuarios WHERE id = ? LIMIT 1`, [userId]);
    if (users.length === 0) {
      throw new Error('Usuario no encontrado');
    }

    const match = await bcrypt.compare(currentPassword, users[0].password);
    if (!match) {
      throw new Error('La contraseña actual es incorrecta');
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword.trim(), salt);

    await pool.query(`UPDATE usuarios SET password = ? WHERE id = ?`, [hashed, userId]);
    return true;
  }
}

module.exports = new AuthService();
