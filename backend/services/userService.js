const { pool } = require('../config/db');
const bcrypt = require('bcryptjs');

class UserService {
  /**
   * Listar todos los usuarios con sucursal asignada
   */
  async getAllUsers() {
    const [rows] = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.sucursal_id, u.ci, u.telefono, u.estado, u.ultimo_login,
              s.nombre AS sucursal_nombre, s.codigo AS sucursal_codigo
       FROM usuarios u
       LEFT JOIN sucursales s ON u.sucursal_id = s.id
       ORDER BY u.rol ASC, u.nombre ASC`
    );
    return rows;
  }

  /**
   * Obtener un usuario por ID
   */
  async getUserById(id) {
    const [rows] = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.sucursal_id, u.ci, u.telefono, u.estado, u.ultimo_login,
              s.nombre AS sucursal_nombre, s.codigo AS sucursal_codigo
       FROM usuarios u
       LEFT JOIN sucursales s ON u.sucursal_id = s.id
       WHERE u.id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      throw new Error('Usuario no encontrado');
    }
    return rows[0];
  }

  /**
   * Crear un nuevo usuario
   */
  async createUser(data) {
    const { nombre, email, password, rol = 'vendedor', sucursal_id, ci, telefono } = data;

    if (!nombre || !email || !password) {
      throw new Error('Nombre, correo electrónico y contraseña son obligatorios');
    }

    if (rol === 'vendedor' && !sucursal_id) {
      throw new Error('Un usuario con rol Vendedor debe tener una sucursal asignada');
    }

    // Verificar si el correo ya existe
    const [existing] = await pool.query(
      `SELECT id FROM usuarios WHERE email = ? LIMIT 1`,
      [email.trim().toLowerCase()]
    );
    if (existing.length > 0) {
      throw new Error('El correo electrónico ya se encuentra registrado en el sistema');
    }

    // Encriptar contraseña con bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const targetSucursalId = rol === 'admin' ? null : parseInt(sucursal_id, 10);

    const [res] = await pool.query(
      `INSERT INTO usuarios (nombre, email, password, rol, sucursal_id, ci, telefono, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'activo')`,
      [nombre.trim(), email.trim().toLowerCase(), hashedPassword, rol, targetSucursalId, ci || null, telefono || null]
    );

    return this.getUserById(res.insertId);
  }

  /**
   * Actualizar usuario existente
   */
  async updateUser(id, data) {
    const user = await this.getUserById(id);

    const { nombre, email, password, rol, sucursal_id, ci, telefono, estado } = data;

    if (email && email.trim().toLowerCase() !== user.email) {
      const [existing] = await pool.query(
        `SELECT id FROM usuarios WHERE email = ? AND id != ? LIMIT 1`,
        [email.trim().toLowerCase(), id]
      );
      if (existing.length > 0) {
        throw new Error('El correo electrónico ya pertenece a otro usuario');
      }
    }

    const newRol = rol || user.rol;
    const newSucursalId = newRol === 'admin' ? null : (sucursal_id !== undefined ? sucursal_id : user.sucursal_id);

    let updateFields = [
      'nombre = ?',
      'email = ?',
      'rol = ?',
      'sucursal_id = ?',
      'ci = ?',
      'telefono = ?',
      'estado = ?'
    ];
    let updateValues = [
      nombre ? nombre.trim() : user.nombre,
      email ? email.trim().toLowerCase() : user.email,
      newRol,
      newSucursalId,
      ci !== undefined ? ci : user.ci,
      telefono !== undefined ? telefono : user.telefono,
      estado || user.estado
    ];

    if (password && password.trim().length >= 6) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      updateFields.push('password = ?');
      updateValues.push(hashedPassword);
    }

    updateValues.push(id);

    await pool.query(
      `UPDATE usuarios SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    return this.getUserById(id);
  }

  /**
   * Cambiar estado de usuario (activo / inactivo)
   */
  async toggleUserStatus(id) {
    const user = await this.getUserById(id);
    const newStatus = user.estado === 'activo' ? 'inactivo' : 'activo';

    await pool.query(
      `UPDATE usuarios SET estado = ? WHERE id = ?`,
      [newStatus, id]
    );

    return { id, estado: newStatus };
  }
}

module.exports = new UserService();
