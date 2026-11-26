const inventarioService = require('../services/inventarioService');
const { registrarAuditoria } = require('../utils/auditoriaHelper');

class PosController {
  /**
   * GET /api/pos/productos
   * Obtener productos disponibles en la sucursal activa
   */
  async getProducts(req, res, next) {
    try {
      const sucursalId = req.sucursalId;
      const { busqueda, categoria_id } = req.query;

      const productos = await inventarioService.getProductosPOS(sucursalId, {
        busqueda: busqueda || '',
        categoriaId: categoria_id || null
      });

      return res.status(200).json({
        success: true,
        sucursalId,
        total: productos.length,
        data: productos
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/pos/categorias
   * Obtener categorías disponibles
   */
  async getCategories(req, res, next) {
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
   * GET /api/pos/arqueo-activo
   * Obtener arqueo de caja abierto para el usuario en la sucursal activa
   */
  async getActiveCash(req, res, next) {
    try {
      const sucursalId = req.sucursalId;
      const usuarioId = req.user.rol === 'admin' ? null : req.user.id;

      const arqueo = await inventarioService.getArqueoActivo(sucursalId, usuarioId);

      return res.status(200).json({
        success: true,
        cajaAbierta: !!arqueo,
        data: arqueo
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/pos/abrir-caja
   * Abrir caja con monto inicial
   */
  async openCash(req, res, next) {
    try {
      const sucursalId = req.sucursalId;
      const usuarioId = req.user.id;
      const { monto_apertura, observaciones } = req.body;

      if (monto_apertura === undefined || monto_apertura === null || isNaN(monto_apertura) || parseFloat(monto_apertura) < 0) {
        return res.status(400).json({
          success: false,
          error: 'Debe ingresar un monto de apertura válido en Bolivianos (Bs.)'
        });
      }

      const nuevoArqueo = await inventarioService.abrirCaja(
        sucursalId,
        usuarioId,
        monto_apertura,
        observaciones || 'Apertura de turno'
      );

      await registrarAuditoria(
        usuarioId,
        sucursalId,
        'Caja',
        'Apertura de caja',
        `Abrió turno de caja con fondo inicial de Bs. ${parseFloat(monto_apertura).toFixed(2)}`,
        req
      );

      return res.status(201).json({
        success: true,
        message: 'Caja abierta exitosamente',
        data: nuevoArqueo
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/pos/ventas
   * Procesar venta en punto de venta
   */
  async processSale(req, res, next) {
    try {
      const sucursalId = req.sucursalId;
      const usuarioId = req.user.id;

      const resultado = await inventarioService.procesarVentaPOS(sucursalId, usuarioId, req.body);

      await registrarAuditoria(
        usuarioId,
        sucursalId,
        'POS',
        'Venta registrada',
        `Venta ${resultado.numeroComprobante} por Bs. ${Number(resultado.montoTotal).toFixed(2)} (${resultado.metodoPago})`,
        req
      );

      return res.status(201).json({
        success: true,
        message: `Venta registrada con éxito: ${resultado.numeroComprobante}`,
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/pos/gastos
   * Registrar egreso o gasto en caja
   */
  async addExpense(req, res, next) {
    try {
      const sucursalId = req.sucursalId;
      const usuarioId = req.user.id;

      const resultado = await inventarioService.registrarGasto(sucursalId, usuarioId, req.body);
      const esIngreso = resultado.tipo === 'ingreso';

      await registrarAuditoria(
        usuarioId,
        sucursalId,
        'Ingresos/Egresos',
        esIngreso ? 'Ingreso extra registrado' : 'Gasto registrado',
        `${esIngreso ? 'Ingreso' : 'Egreso'} en ${resultado.categoria_gasto} por Bs. ${resultado.monto.toFixed(2)} (${resultado.metodo_pago}) - ${resultado.concepto}`,
        req
      );

      return res.status(201).json({
        success: true,
        message: `${esIngreso ? 'Ingreso' : 'Gasto'} de Bs. ${resultado.monto.toFixed(2)} registrado en ${resultado.categoria_gasto}`,
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/pos/saldo-anterior
   * Obtener el saldo de cierre del turno anterior
   */
  async getSaldoAnterior(req, res, next) {
    try {
      const sucursalId = req.sucursalId;
      const data = await inventarioService.getSaldoCierreAnterior(sucursalId);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/pos/cerrar-caja
   * Cerrar turno de caja y calcular diferencia
   */
  async closeCash(req, res, next) {
    try {
      const sucursalId = req.sucursalId;
      const usuarioId = req.user.id;
      const resultado = await inventarioService.cerrarCaja(sucursalId, usuarioId, req.body);

      await registrarAuditoria(
        usuarioId,
        sucursalId,
        'Caja',
        'Cierre de caja',
        `Cerró turno. Sistema: Bs. ${resultado.montoCierreSistema.toFixed(2)} | Físico: Bs. ${resultado.montoCierreReal.toFixed(2)} | Dif: Bs. ${resultado.diferencia.toFixed(2)}`,
        req
      );

      return res.status(200).json({
        success: true,
        message: resultado.cuadraExacto 
          ? 'Caja cerrada exitosamente. ¡El efectivo físico cuadra con el sistema!' 
          : (resultado.diferencia > 0 
              ? `Caja cerrada. Hay un sobrante de Bs. ${resultado.sobrante.toFixed(2)}` 
              : `Caja cerrada. Hay un faltante de Bs. ${resultado.faltante.toFixed(2)}`),
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/pos/historial-arqueos
   * Listar historial de cierres de caja
   */
  async getHistorialArqueos(req, res, next) {
    try {
      const sucursalId = req.sucursalId;
      const historial = await inventarioService.getHistorialArqueos(sucursalId);
      return res.status(200).json({
        success: true,
        data: historial
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/pos/gastos
   * Listar egresos y gastos registrados
   */
  async getExpenses(req, res, next) {
    try {
      const sucursalId = req.sucursalId;
      const resultado = await inventarioService.getGastos(sucursalId, req.query);
      return res.status(200).json({
        success: true,
        data: resultado.gastos,
        resumen: resultado.resumen
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/pos/compras-cajas
   * Registrar compra por cajas (12, 24, 46, 100 u.)
   */
  async registerBoxPurchase(req, res, next) {
    try {
      const sucursalId = req.sucursalId;
      const resultado = await inventarioService.registrarCompraPorCajas(sucursalId, req.body);

      await registrarAuditoria(
        req.user.id,
        sucursalId,
        'Compras',
        'Compra ingresada',
        `Ingresó ${resultado.totalCajas} caja(s) (${resultado.unidadesIngresadas} u.) - Inversión: Bs. ${Number(resultado.inversionTotal || 0).toFixed(2)}`,
        req
      );

      return res.status(201).json({
        success: true,
        message: `Lote registrado: ${resultado.unidadesIngresadas} unidades ingresadas a costo unitario de Bs. ${resultado.costoUnitario.toFixed(2)}`,
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PosController();
