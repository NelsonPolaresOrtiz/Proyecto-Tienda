const userService = require('../services/userService');
const { registrarAuditoria } = require('../utils/auditoriaHelper');

class UserController {
  async list(req, res, next) {
    try {
      const users = await userService.getAllUsers();
      return res.status(200).json({
        success: true,
        data: users
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const user = await userService.getUserById(req.params.id);
      return res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const user = await userService.createUser(req.body);
      await registrarAuditoria(
        req.user.id,
        user.sucursal_id || null,
        'Usuarios',
        'Usuario creado',
        `Creó usuario ${user.nombre} (${user.email}) con rol ${user.rol === 'admin' ? 'Administrador' : 'Cajero'}`,
        req
      );
      return res.status(201).json({
        success: true,
        message: `Usuario ${user.nombre} creado con éxito`,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const user = await userService.updateUser(req.params.id, req.body);
      await registrarAuditoria(
        req.user.id,
        user.sucursal_id || null,
        'Usuarios',
        'Usuario actualizado',
        `Actualizó datos de ${user.nombre} (${user.email})`,
        req
      );
      return res.status(200).json({
        success: true,
        message: `Usuario ${user.nombre} actualizado con éxito`,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  async toggleStatus(req, res, next) {
    try {
      const result = await userService.toggleUserStatus(req.params.id);
      await registrarAuditoria(
        req.user.id,
        null,
        'Usuarios',
        'Estado de usuario cambiado',
        `Cambió estado del usuario #${req.params.id} a ${result.estado}`,
        req
      );
      return res.status(200).json({
        success: true,
        message: `Estado de usuario cambiado a ${result.estado}`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();
