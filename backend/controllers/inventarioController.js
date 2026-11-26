const inventarioService = require('../services/inventarioService');
const { registrarAuditoria } = require('../utils/auditoriaHelper');

class InventarioController {
  /**
   * GET /api/inventario/catalogo
   * Catálogo Maestro de Productos
   */
  async getCatalogo(req, res, next) {
    try {
      const productos = await inventarioService.getCatalogoProductos();
      return res.status(200).json({
        success: true,
        data: productos
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventario/categorias
   * Listar categorías activas de productos
   */
  async getCategorias(req, res, next) {
    try {
      const categorias = await inventarioService.getCategorias();
      return res.status(200).json({
        success: true,
        data: categorias
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventario/lotes
   * Listar lotes de inventario
   */
  async getLotes(req, res, next) {
    try {
      // Si es vendedor, forzar su sucursal_id; si es admin, puede filtrar por query
      const targetSucursalId = req.user.rol === 'vendedor' 
        ? req.user.sucursal_id 
        : (req.query.sucursal_id ? parseInt(req.query.sucursal_id, 10) : null);

      const lotes = await inventarioService.getLotes(targetSucursalId);
      return res.status(200).json({
        success: true,
        data: lotes
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/inventario/compras
   * Registrar compra por cajas (con cálculo reactivo)
   */
  async registerPurchase(req, res, next) {
    try {
      const targetSucursalId = req.user.rol === 'vendedor'
        ? req.user.sucursal_id
        : (req.body.sucursal_id ? parseInt(req.body.sucursal_id, 10) : 1);

      const resultado = await inventarioService.registrarCompraPorCajas(targetSucursalId, req.body);

      const detalleItems = (resultado.lotes && resultado.lotes.length > 0)
        ? resultado.lotes.map(l => `${l.cajas} caja(s) de ${l.productoNombre}`).join(', ')
        : `${resultado.totalCajas} caja(s) (${resultado.totalUnidades} u.)`;
      await registrarAuditoria(
        req.user.id,
        targetSucursalId,
        'Compras',
        'Compra ingresada',
        `Ingresó ${detalleItems} - Inversión: Bs. ${Number(resultado.inversionTotal || 0).toFixed(2)}`,
        req
      );

      return res.status(201).json({
        success: true,
        message: resultado.mensaje || `Compra registrada exitosamente: ${resultado.unidadesIngresadas || resultado.totalUnidades} unidades ingresadas`,
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventario/vencimientos
   * Listado de lotes para control de vencimientos y alertas
   */
  async getVencimientos(req, res, next) {
    try {
      let targetSucursalId = null;
      if (req.user.rol === 'vendedor') {
        targetSucursalId = req.user.sucursal_id;
      } else if (req.query.sucursal_id && req.query.sucursal_id !== 'todas') {
        targetSucursalId = parseInt(req.query.sucursal_id, 10);
      }

      const filtro = req.query.filtro || 'todos';
      const lotes = await inventarioService.getVencimientos(targetSucursalId, filtro);

      return res.status(200).json({
        success: true,
        data: lotes
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventario/vencimientos/config-whatsapp
   */
  async getConfigWhatsapp(req, res, next) {
    try {
      const whatsappService = require('../services/whatsappService');
      const config = await whatsappService.getConfig();
      return res.status(200).json({
        success: true,
        data: config
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/inventario/vencimientos/config-whatsapp
   */
  async saveConfigWhatsapp(req, res, next) {
    try {
      const whatsappService = require('../services/whatsappService');
      const config = await whatsappService.updateConfig(req.body);
      return res.status(200).json({
        success: true,
        message: 'Configuración de alertas WhatsApp guardada exitosamente',
        data: config
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/inventario/vencimientos/notificar-whatsapp
   */
  async notificarWhatsApp(req, res, next) {
    try {
      const whatsappService = require('../services/whatsappService');
      const resultado = await whatsappService.enviarNotificacion(true);

      await registrarAuditoria(
        req.user.id,
        req.user.sucursal_id || null,
        'Vencimientos',
        'Alertas WhatsApp enviadas',
        `Disparó envío manual de alertas de vencimiento (${resultado.totalLotes || 0} lotes críticos, ${resultado.enviosCajeros?.length || 0} cajero(s) notificado(s))`,
        req
      );

      return res.status(200).json({
        success: true,
        message: `Alerta generada para ${resultado.totalLotes} lote(s) próximo(s) a vencer`,
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/inventario/lotes/:id/oferta
   * Poner lote en oferta / rebaja
   */
  async applyOffer(req, res, next) {
    try {
      const loteId = parseInt(req.params.id, 10);
      const vendedorSucursalId = req.user.rol === 'vendedor' ? req.user.sucursal_id : null;
      const resultado = await inventarioService.aplicarOfertaLote(loteId, req.body, vendedorSucursalId);

      await registrarAuditoria(
        req.user.id,
        resultado.sucursal_id,
        'Vencimientos',
        resultado.en_oferta ? 'Oferta aplicada' : 'Oferta retirada',
        `Lote ${resultado.numero_lote} (${resultado.producto_nombre}): ${resultado.en_oferta ? `Descuento ${resultado.descuento_porcentaje}% -> Bs. ${resultado.precio_venta_oferta}` : 'Precio normal restaurado'}`,
        req
      );

      return res.status(200).json({
        success: true,
        message: resultado.en_oferta 
          ? `Lote puesto en oferta con ${resultado.descuento_porcentaje}% de descuento (Precio: Bs. ${resultado.precio_venta_oferta})`
          : 'Lote retirado de oferta promocional',
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/inventario/traspasos
   * Realizar traspaso de mercadería entre sucursales
   */
  async transferStock(req, res, next) {
    try {
      const usuarioId = req.user.id;
      const data = {
        ...req.body,
        usuario_id: usuarioId
      };

      // Si es vendedor, sólo puede enviar desde su sucursal asignada
      if (req.user.rol === 'vendedor' && parseInt(data.sucursal_origen_id, 10) !== req.user.sucursal_id) {
        return res.status(403).json({
          success: false,
          error: 'No tiene permiso para despachar mercadería de otra sucursal'
        });
      }

      const resultado = await inventarioService.realizarTraspaso(data);
      await registrarAuditoria(
        usuarioId,
        data.sucursal_origen_id,
        'Traspasos',
        'Traspaso realizado',
        `Traspaso ${resultado.codigoTraspaso}: envió ${data.cantidad} u. hacia sucursal #${data.sucursal_destino_id}`,
        req
      );
      return res.status(201).json({
        success: true,
        message: `Traspaso registrado exitosamente (${resultado.codigoTraspaso})`,
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventario/traspasos
   * Historial de traspasos
   */
  async getTransfers(req, res, next) {
    try {
      const targetSucursalId = req.user.rol === 'vendedor'
        ? req.user.sucursal_id
        : (req.query.sucursal_id ? parseInt(req.query.sucursal_id, 10) : null);

      const traspasos = await inventarioService.getTraspasos(targetSucursalId);
      return res.status(200).json({
        success: true,
        data: traspasos
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventario/sucursal/:id
   * Panel de inventario detallado de la sucursal con KPIs y cálculos
   */
  async getInventarioSucursal(req, res, next) {
    try {
      const user = req.user;
      let sucursalId = parseInt(req.params.id, 10);
      if (user.rol === 'vendedor') {
        sucursalId = user.sucursal_id;
      }

      const { busqueda, categoria_id, estado } = req.query;
      const data = await inventarioService.getInventarioSucursal(sucursalId, {
        busqueda: busqueda || '',
        categoriaId: categoria_id || null,
        estado: estado || 'todos'
      });

      return res.status(200).json({
        success: true,
        sucursalId,
        kpis: data.kpis,
        total: data.productos.length,
        data: data.productos
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/inventario/productos
   * Crear nuevo producto en catálogo maestro y habilitarlo en sucursales
   */
  async createProduct(req, res, next) {
    try {
      const resultado = await inventarioService.crearProducto(req.body);
      await registrarAuditoria(
        req.user.id,
        req.user.sucursal_id || null,
        'Inventario',
        'Producto creado',
        `Registró nuevo producto "${resultado.nombre}" (Código: ${resultado.codigo_barras})`,
        req
      );
      return res.status(201).json({
        success: true,
        message: `Producto "${resultado.nombre}" creado exitosamente`,
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventario/sucursal/:sucursalId/productos/:productoId/lotes
   * Listar lotes de un producto en la sucursal
   */
  async getProductLots(req, res, next) {
    try {
      const user = req.user;
      let sucursalId = parseInt(req.params.sucursalId, 10);
      if (user.rol === 'vendedor') {
        sucursalId = user.sucursal_id;
      }
      const productoId = parseInt(req.params.productoId, 10);

      const lotes = await inventarioService.getLotesProducto(sucursalId, productoId);
      return res.status(200).json({
        success: true,
        sucursalId,
        productoId,
        total: lotes.length,
        data: lotes
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/inventario/sucursal/:sucursalId/productos/:productoId/precio-oferta
   * Actualizar precio normal u oferta en la tienda
   */
  async updatePriceOffer(req, res, next) {
    try {
      const user = req.user;
      let sucursalId = parseInt(req.params.sucursalId, 10);
      if (user.rol === 'vendedor') {
        sucursalId = user.sucursal_id;
      }
      const productoId = parseInt(req.params.productoId, 10);

      const resultado = await inventarioService.actualizarPrecioOferta(sucursalId, productoId, req.body);
      await registrarAuditoria(
        user.id,
        sucursalId,
        'Inventario',
        'Cambio de precio/oferta',
        resultado.en_oferta
          ? `Producto #${productoId} puesto en oferta a Bs. ${resultado.precio_venta_oferta} (${resultado.descuento_porcentaje}%)`
          : `Producto #${productoId} actualizado a precio normal Bs. ${resultado.precio_venta_normal.toFixed(2)}`,
        req
      );
      return res.status(200).json({
        success: true,
        message: resultado.en_oferta
          ? `Producto puesto en oferta a Bs. ${resultado.precio_venta_oferta} (${resultado.descuento_porcentaje}%)`
          : `Precio normal actualizado a Bs. ${resultado.precio_venta_normal.toFixed(2)}`,
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/inventario/sucursal/:sucursalId/productos/:productoId/ajuste-stock
   * Registrar corrección o merma física de stock
   */
  async adjustStock(req, res, next) {
    try {
      const user = req.user;
      let sucursalId = parseInt(req.params.sucursalId, 10);
      if (user.rol === 'vendedor') {
        sucursalId = user.sucursal_id;
      }
      const productoId = parseInt(req.params.productoId, 10);
      const usuarioId = user.id;

      const resultado = await inventarioService.ajustarStock(sucursalId, productoId, usuarioId, req.body);
      await registrarAuditoria(
        usuarioId,
        sucursalId,
        'Inventario',
        'Ajuste físico de stock',
        `Producto #${productoId}: ajuste (${req.body.tipo_ajuste}) a ${resultado.stockNuevo} u. (${resultado.diferencia > 0 ? '+' : ''}${resultado.diferencia} u.) - ${req.body.motivo}`,
        req
      );
      return res.status(200).json({
        success: true,
        message: `Stock ajustado exitosamente. Nuevo stock: ${resultado.stockNuevo} u. (${resultado.diferencia > 0 ? '+' : ''}${resultado.diferencia} u.)`,
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InventarioController();
