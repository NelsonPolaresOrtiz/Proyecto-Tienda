const { pool } = require('../config/db');

class InventarioService {
  /**
   * Obtener productos de una sucursal específica para el POS
   */
  async getProductosPOS(sucursalId, options = {}) {
    const { busqueda = '', categoriaId = null } = options;

    let targetSucursalId = sucursalId ? parseInt(sucursalId, 10) : null;
    if (!targetSucursalId || isNaN(targetSucursalId)) {
      const [firstSuc] = await pool.query(
        `SELECT id FROM sucursales WHERE estado = 'activo' ORDER BY es_matriz DESC, id ASC LIMIT 1`
      );
      targetSucursalId = firstSuc.length > 0 ? firstSuc[0].id : 1;
    }

    let query = `
      SELECT p.id, p.codigo_barras, p.nombre, p.descripcion, p.unidad_medida, p.contenido_por_caja,
             p.imagen_url, c.id AS categoria_id, c.nombre AS categoria_nombre, c.color AS categoria_color,
             sp.precio_venta_normal, sp.en_oferta, sp.descuento_porcentaje, sp.precio_venta_oferta,
             CASE WHEN sp.en_oferta = 1 AND sp.precio_venta_oferta IS NOT NULL 
                  THEN sp.precio_venta_oferta 
                  ELSE sp.precio_venta_normal 
             END AS precio_final,
             sp.stock_total_unidades, sp.stock_minimo_alerta,
             prox.numero_lote AS proximo_lote,
             prox.fecha_vencimiento AS proximo_vencimiento,
             DATEDIFF(prox.fecha_vencimiento, CURDATE()) AS dias_para_vencer,
             prox.en_oferta AS lote_en_oferta
      FROM sucursal_productos sp
      JOIN productos p ON sp.producto_id = p.id
      JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN (
        SELECT il1.producto_id, il1.sucursal_id, il1.numero_lote, il1.fecha_vencimiento, il1.en_oferta
        FROM inventario_lotes il1
        INNER JOIN (
          SELECT producto_id, sucursal_id, MIN(fecha_vencimiento) as min_venc
          FROM inventario_lotes
          WHERE stock_actual_unidades > 0 AND estado = 'activo'
          GROUP BY producto_id, sucursal_id
        ) il2 ON il1.producto_id = il2.producto_id AND il1.sucursal_id = il2.sucursal_id AND il1.fecha_vencimiento = il2.min_venc
        WHERE il1.stock_actual_unidades > 0 AND il1.estado = 'activo'
        GROUP BY il1.producto_id, il1.sucursal_id
      ) prox ON sp.producto_id = prox.producto_id AND sp.sucursal_id = prox.sucursal_id
      WHERE sp.sucursal_id = ? AND sp.estado = 'activo' AND p.estado = 'activo' AND sp.stock_total_unidades > 0
    `;

    const params = [targetSucursalId];

    if (categoriaId) {
      query += ` AND c.id = ?`;
      params.push(categoriaId);
    }

    if (busqueda.trim()) {
      query += ` AND (p.nombre LIKE ? OR p.codigo_barras LIKE ?)`;
      params.push(`%${busqueda.trim()}%`, `%${busqueda.trim()}%`);
    }

    query += ` ORDER BY p.nombre ASC`;

    const [rows] = await pool.query(query, params);
    return rows;
  }

  /**
   * Obtener todas las categorías comerciales
   */
  async getCategorias() {
    const [rows] = await pool.query(
      `SELECT id, nombre, descripcion, icono, color FROM categorias WHERE estado = 'activo' ORDER BY id ASC`
    );
    return rows;
  }

  /**
   * Registrar compra por cajas (soporta multi-producto en una misma nota o compra individual)
   */
  async registrarCompraPorCajas(sucursalId, data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Normalizar lista de items (soporta lote individual o array multi-producto)
      const items = (data.items && Array.isArray(data.items) && data.items.length > 0)
        ? data.items
        : [data];

      const proveedorGlobal = data.proveedor || '';
      const fechaIngresoGlobal = data.fecha_ingreso || new Date().toISOString().slice(0, 10);
      const fechaVencimientoGlobal = data.fecha_vencimiento || null;
      const observacionesGlobal = data.observaciones || '';

      const lotesCreados = [];
      let totalCajas = 0;
      let totalUnidades = 0;
      let totalInversion = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const productoId = parseInt(item.producto_id, 10);
        const uPorCaja = parseInt(item.unidades_por_caja, 10) || 1;
        const cajas = parseFloat(item.cajas_compradas) || 1;
        const costCaja = parseFloat(item.costo_caja) || 0;
        const precioVenta = parseFloat(item.precio_venta_normal) || 0;
        const unidadesTotales = Math.round(cajas * uPorCaja);
        const costoUnitario = uPorCaja > 0 ? parseFloat((costCaja / uPorCaja).toFixed(2)) : 0;
        const inversionItem = parseFloat((cajas * costCaja).toFixed(2));

        const proveedorItem = item.proveedor || proveedorGlobal;
        const fechaIngresoItem = item.fecha_ingreso || fechaIngresoGlobal;
        const fechaVencimientoItem = item.fecha_vencimiento || fechaVencimientoGlobal;
        const observacionesItem = item.observaciones || observacionesGlobal;

        // Generar número de lote amigable si no viene especificado
        let numLote = item.numero_lote ? String(item.numero_lote).trim() : '';
        if (!numLote) {
          const randNum = Math.floor(100 + Math.random() * 900);
          const dateCode = new Date().toISOString().slice(2, 10).replace(/-/g, '');
          numLote = `LOT-${dateCode}-${productoId}-${randNum}`;
        }

        // 1. Insertar en inventario_lotes
        const [resLote] = await connection.query(
          `INSERT INTO inventario_lotes (
            sucursal_id, producto_id, numero_lote, unidades_por_caja, cajas_compradas,
            unidades_totales_ingresadas, costo_caja, costo_unitario, precio_venta_normal,
            en_oferta, precio_venta_oferta, stock_actual_unidades, fecha_ingreso,
            fecha_vencimiento, proveedor, observaciones, estado
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo')`,
          [
            sucursalId, productoId, numLote, uPorCaja, cajas,
            unidadesTotales, costCaja, costoUnitario, precioVenta,
            item.en_oferta ? 1 : 0, item.precio_venta_oferta || null, unidadesTotales,
            fechaIngresoItem, fechaVencimientoItem, proveedorItem, observacionesItem
          ]
        );

        // 2. Actualizar o insertar en sucursal_productos
        const [existingSp] = await connection.query(
          `SELECT id, stock_total_unidades FROM sucursal_productos 
           WHERE sucursal_id = ? AND producto_id = ? LIMIT 1`,
          [sucursalId, productoId]
        );

        if (existingSp.length > 0) {
          await connection.query(
            `UPDATE sucursal_productos 
             SET stock_total_unidades = stock_total_unidades + ?,
                 precio_venta_normal = ?
             WHERE id = ?`,
            [unidadesTotales, precioVenta, existingSp[0].id]
          );
        } else {
          await connection.query(
            `INSERT INTO sucursal_productos (
              sucursal_id, producto_id, precio_venta_normal, stock_total_unidades, stock_minimo_alerta, estado
            ) VALUES (?, ?, ?, ?, 10, 'activo')`,
            [sucursalId, productoId, precioVenta, unidadesTotales]
          );
        }

        const [prodRows] = await connection.query(`SELECT nombre FROM productos WHERE id = ? LIMIT 1`, [productoId]);
        const productoNombre = prodRows.length > 0 ? prodRows[0].nombre : `Producto #${productoId}`;

        totalCajas += cajas;
        totalUnidades += unidadesTotales;
        totalInversion += inversionItem;

        lotesCreados.push({
          loteId: resLote.insertId,
          productoId,
          productoNombre,
          numeroLote: numLote,
          cajas,
          unidadesTotales,
          costoUnitario,
          precioVenta,
          inversionItem
        });
      }

      await connection.commit();

      return {
        mensaje: `Compra registrada exitosamente: ${totalUnidades} unidades ingresadas (${totalCajas} cajas)`,
        itemsProcesados: items.length,
        totalCajas,
        totalUnidades,
        unidadesIngresadas: totalUnidades,
        costoUnitario: lotesCreados[0]?.costoUnitario || 0,
        precioVenta: lotesCreados[0]?.precioVenta || 0,
        inversionTotal: parseFloat(totalInversion.toFixed(2)),
        lotes: lotesCreados
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Procesar venta en POS para una sucursal específica con deducción FIFO
   */
  async procesarVentaPOS(sucursalId, usuarioId, datosVenta) {
    const {
      cliente_nombre = 'Sin Nombre / Consumidor Final',
      cliente_nit_ci = '0',
      tipo_comprobante = 'nota_venta',
      metodo_pago = 'efectivo',
      items = [],
      descuento = 0,
      monto_recibido = 0,
      es_venta_rapida = false,
      monto_total_rapido = 0,
      monto_efectivo = 0,
      monto_qr = 0
    } = datosVenta;

    if (!es_venta_rapida && (!items || items.length === 0)) {
      throw new Error('La venta debe incluir al menos un producto o ser Venta Rápida');
    }

    const montoRapidoFinal = parseFloat(monto_total_rapido || datosVenta.monto_total || 0);
    if (es_venta_rapida && montoRapidoFinal <= 0) {
      throw new Error('Debe especificar un monto válido en Bolivianos para la Venta Rápida');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Verificar arqueo de caja abierto
      let [arqueos] = await connection.query(
        `SELECT id FROM arqueos_caja 
         WHERE sucursal_id = ? AND usuario_id = ? AND estado = 'abierta' 
         ORDER BY id DESC LIMIT 1`,
        [sucursalId, usuarioId]
      );
      if (arqueos.length === 0) {
        [arqueos] = await connection.query(
          `SELECT id FROM arqueos_caja 
           WHERE sucursal_id = ? AND estado = 'abierta' 
           ORDER BY id DESC LIMIT 1`,
          [sucursalId]
        );
      }
      const arqueoId = arqueos.length > 0 ? arqueos[0].id : null;

      // 2. Calcular montos con validación numérica
      let subtotalTotal = 0;
      if (es_venta_rapida) {
        subtotalTotal = montoRapidoFinal;
      } else {
        for (const it of items) {
          const itemCant = parseFloat(it.cantidad) || 1;
          const itemPrecio = parseFloat(it.precio_unitario) || 0;
          const itemSub = (it.subtotal !== undefined && it.subtotal !== null && !isNaN(it.subtotal))
            ? parseFloat(it.subtotal)
            : parseFloat((itemCant * itemPrecio).toFixed(2));
          it.subtotal = itemSub;
          subtotalTotal += itemSub;
        }
      }

      subtotalTotal = parseFloat(subtotalTotal.toFixed(2));
      const montoTotal = Math.max(0, parseFloat((subtotalTotal - parseFloat(descuento || 0)).toFixed(2)));
      const rec = parseFloat(monto_recibido || 0);
      const cambio = rec > 0 ? Math.max(0, parseFloat((rec - montoTotal).toFixed(2))) : 0;

      // 3. Generar correlativo
      const [countRow] = await connection.query(
        `SELECT COUNT(*) AS total FROM ventas WHERE sucursal_id = ?`,
        [sucursalId]
      );
      const correlativo = String(countRow[0].total + 1).padStart(6, '0');
      const prefix = es_venta_rapida ? 'VR' : 'CB';
      const numeroComprobante = `${prefix}-S${sucursalId}-${correlativo}`;

      // 4. Insertar venta
      const [resVenta] = await connection.query(
        `INSERT INTO ventas (
          sucursal_id, usuario_id, arqueo_id, numero_comprobante, tipo_comprobante,
          cliente_nombre, cliente_nit_ci, metodo_pago, subtotal, descuento,
          monto_total, monto_recibido, cambio, estado, fecha_venta
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completada', NOW())`,
        [
          sucursalId, usuarioId, arqueoId, numeroComprobante, tipo_comprobante,
          es_venta_rapida ? (cliente_nombre === 'Sin Nombre / Consumidor Final' ? 'Cliente Venta Rápida' : cliente_nombre) : cliente_nombre,
          cliente_nit_ci, metodo_pago, subtotalTotal, descuento || 0,
          montoTotal, monto_recibido || montoTotal, cambio
        ]
      );
      const ventaId = resVenta.insertId;

      // 5. Procesar items y deducción FIFO
      if (!es_venta_rapida && items.length > 0) {
        for (const item of items) {
          const prodId = item.producto_id;
          const cant = parseInt(item.cantidad, 10);
          const precioUnit = parseFloat(item.precio_unitario);
          const subtotal = parseFloat(item.subtotal);

          const [spRows] = await connection.query(
            `SELECT stock_total_unidades FROM sucursal_productos 
             WHERE sucursal_id = ? AND producto_id = ? FOR UPDATE`,
            [sucursalId, prodId]
          );

          if (spRows.length === 0 || spRows[0].stock_total_unidades < cant) {
            throw new Error(`Stock insuficiente para el producto seleccionado (ID: ${prodId})`);
          }

          const [lotes] = await connection.query(
            `SELECT id, stock_actual_unidades, costo_unitario 
             FROM inventario_lotes 
             WHERE sucursal_id = ? AND producto_id = ? AND stock_actual_unidades > 0 AND estado = 'activo'
             ORDER BY fecha_vencimiento ASC, id ASC LIMIT 1`,
            [sucursalId, prodId]
          );

          let loteId = null;
          let costoUnitario = 0.00;

          if (lotes.length > 0) {
            loteId = lotes[0].id;
            costoUnitario = parseFloat(lotes[0].costo_unitario);
            const newStockLote = Math.max(0, lotes[0].stock_actual_unidades - cant);
            await connection.query(
              `UPDATE inventario_lotes SET stock_actual_unidades = ?, estado = CASE WHEN ? = 0 THEN 'agotado' ELSE 'activo' END WHERE id = ?`,
              [newStockLote, newStockLote, loteId]
            );
          }

          await connection.query(
            `UPDATE sucursal_productos 
             SET stock_total_unidades = stock_total_unidades - ? 
             WHERE sucursal_id = ? AND producto_id = ?`,
            [cant, sucursalId, prodId]
          );

          await connection.query(
            `INSERT INTO venta_detalles (
              venta_id, producto_id, lote_id, cantidad, precio_unitario, costo_unitario, es_oferta, subtotal
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [ventaId, prodId, loteId, cant, precioUnit, costoUnitario, item.es_oferta ? 1 : 0, subtotal]
          );
        }
      }

      // 6. Actualizar arqueo de caja si está abierto
      if (arqueoId) {
        if (metodo_pago === 'efectivo') {
          await connection.query(
            `UPDATE arqueos_caja SET total_ventas_efectivo = total_ventas_efectivo + ? WHERE id = ?`,
            [montoTotal, arqueoId]
          );
        } else if (metodo_pago === 'qr_simple') {
          await connection.query(
            `UPDATE arqueos_caja SET total_ventas_qr = total_ventas_qr + ? WHERE id = ?`,
            [montoTotal, arqueoId]
          );
        } else if (metodo_pago === 'tarjeta') {
          await connection.query(
            `UPDATE arqueos_caja SET total_ventas_tarjeta = total_ventas_tarjeta + ? WHERE id = ?`,
            [montoTotal, arqueoId]
          );
        } else if (metodo_pago === 'mixto') {
          const ef = parseFloat(monto_efectivo || 0);
          const qr = parseFloat(monto_qr || 0);
          await connection.query(
            `UPDATE arqueos_caja SET total_ventas_efectivo = total_ventas_efectivo + ?, total_ventas_qr = total_ventas_qr + ? WHERE id = ?`,
            [ef, qr, arqueoId]
          );
        }
      }

      await connection.commit();

      return {
        ventaId,
        numeroComprobante,
        montoTotal,
        metodoPago: metodo_pago,
        cambio,
        esVentaRapida: es_venta_rapida,
        fechaVenta: new Date()
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Obtener saldo de cierre del turno anterior
   */
  async getSaldoCierreAnterior(sucursalId) {
    const [rows] = await pool.query(
      `SELECT id, monto_cierre_real, monto_cierre_sistema, fecha_cierre, observaciones
       FROM arqueos_caja 
       WHERE sucursal_id = ? AND estado = 'cerrada' 
       ORDER BY fecha_cierre DESC, id DESC LIMIT 1`,
      [sucursalId]
    );

    if (rows.length === 0) {
      return {
        existeCierreAnterior: false,
        saldoSugerido: 0.00,
        fechaCierreAnterior: null
      };
    }

    return {
      existeCierreAnterior: true,
      saldoSugerido: parseFloat(rows[0].monto_cierre_real || 0.00),
      fechaCierreAnterior: rows[0].fecha_cierre,
      arqueoAnteriorId: rows[0].id
    };
  }

  /**
   * Obtener arqueo activo del usuario en la sucursal
   */
  async getArqueoActivo(sucursalId, usuarioId = null) {
    let query = `
       SELECT a.*, u.nombre AS cajero_nombre, s.nombre AS sucursal_nombre
       FROM arqueos_caja a
       JOIN usuarios u ON a.usuario_id = u.id
       JOIN sucursales s ON a.sucursal_id = s.id
       WHERE a.sucursal_id = ? AND a.estado = 'abierta'
    `;
    const params = [sucursalId];
    if (usuarioId) {
      query += ` AND a.usuario_id = ?`;
      params.push(usuarioId);
    }
    query += ` ORDER BY a.id DESC LIMIT 1`;

    const [rows] = await pool.query(query, params);

    if (rows.length === 0) return null;

    const act = rows[0];
    const ap = parseFloat(act.monto_apertura || 0);
    const ef = parseFloat(act.total_ventas_efectivo || 0);
    const ingExtra = parseFloat(act.total_ingresos_extra || 0);
    const ga = parseFloat(act.total_gastos || 0);
    const esperado = parseFloat((ap + ef + ingExtra - ga).toFixed(2));

    const [vCount] = await pool.query(
      `SELECT COUNT(*) AS total_transacciones, COALESCE(SUM(monto_total), 0) AS total_facturado 
       FROM ventas WHERE arqueo_id = ?`,
      [act.id]
    );

    const [gCount] = await pool.query(
      `SELECT COUNT(*) AS total_gastos_count FROM egresos_gastos WHERE arqueo_id = ?`,
      [act.id]
    );

    return {
      ...act,
      efectivo_esperado: esperado,
      total_transacciones_ventas: vCount[0].total_transacciones,
      total_facturado_sistema: parseFloat(vCount[0].total_facturado || 0),
      total_registros_gastos: gCount[0].total_gastos_count
    };
  }

  /**
   * Cerrar turno de caja calculando diferencia contra efectivo físico contado
   */
  async cerrarCaja(sucursalId, usuarioId, data) {
    const { monto_cierre_real, observaciones = '' } = data;

    const [arqueos] = await pool.query(
      `SELECT * FROM arqueos_caja 
       WHERE sucursal_id = ? AND usuario_id = ? AND estado = 'abierta' 
       ORDER BY id DESC LIMIT 1`,
      [sucursalId, usuarioId]
    );

    if (arqueos.length === 0) {
      throw new Error('No existe una caja abierta para cerrar en esta sucursal');
    }

    const arqueo = arqueos[0];
    const apertura = parseFloat(arqueo.monto_apertura || 0);
    const ventasEf = parseFloat(arqueo.total_ventas_efectivo || 0);
    const ingExtraEf = parseFloat(arqueo.total_ingresos_extra || 0);
    const gastosEf = parseFloat(arqueo.total_gastos || 0);

    const montoSistema = parseFloat((apertura + ventasEf + ingExtraEf - gastosEf).toFixed(2));
    const montoReal = parseFloat(monto_cierre_real);
    const diferencia = parseFloat((montoReal - montoSistema).toFixed(2));

    await pool.query(
      `UPDATE arqueos_caja 
       SET monto_cierre_sistema = ?, monto_cierre_real = ?, diferencia = ?,
           estado = 'cerrada', fecha_cierre = NOW(), observaciones = ?
       WHERE id = ?`,
      [montoSistema, montoReal, diferencia, observaciones, arqueo.id]
    );

    return {
      arqueoId: arqueo.id,
      montoApertura: apertura,
      totalVentasEfectivo: ventasEf,
      totalGastos: gastosEf,
      montoCierreSistema: montoSistema,
      montoCierreReal: montoReal,
      diferencia,
      cuadraExacto: Math.abs(diferencia) < 0.01,
      sobrante: diferencia > 0 ? diferencia : 0,
      faltante: diferencia < 0 ? Math.abs(diferencia) : 0,
      fechaCierre: new Date()
    };
  }

  /**
   * Obtener historial de cierres de caja
   */
  async getHistorialArqueos(sucursalId) {
    const [rows] = await pool.query(
      `SELECT a.*, u.nombre AS cajero_nombre, s.nombre AS sucursal_nombre
       FROM arqueos_caja a
       JOIN usuarios u ON a.usuario_id = u.id
       JOIN sucursales s ON a.sucursal_id = s.id
       WHERE a.sucursal_id = ? AND a.estado = 'cerrada'
       ORDER BY a.fecha_cierre DESC, a.id DESC LIMIT 30`,
      [sucursalId]
    );
    return rows;
  }

  /**
   * Listar movimientos financieros (Ingresos extra y Egresos) con filtros y KPIs unificados
   */
  async getGastos(sucursalId, options = {}) {
    const { metodo_pago, tipo, categoria_gasto, fecha_inicio, fecha_fin } = options;

    let whereClause = ` WHERE 1=1`;
    const params = [];

    if (sucursalId) {
      whereClause += ` AND g.sucursal_id = ?`;
      params.push(sucursalId);
    }

    if (tipo && (tipo === 'egreso' || tipo === 'ingreso')) {
      whereClause += ` AND g.tipo = ?`;
      params.push(tipo);
    }

    if (categoria_gasto && categoria_gasto !== 'todas') {
      whereClause += ` AND g.categoria_gasto = ?`;
      params.push(categoria_gasto);
    }

    if (metodo_pago && metodo_pago !== 'todos') {
      whereClause += ` AND g.metodo_pago = ?`;
      params.push(metodo_pago);
    }

    if (fecha_inicio) {
      whereClause += ` AND DATE(g.fecha_gasto) >= ?`;
      params.push(fecha_inicio);
    }

    if (fecha_fin) {
      whereClause += ` AND DATE(g.fecha_gasto) <= ?`;
      params.push(fecha_fin);
    }

    const query = `
      SELECT g.*, u.nombre AS cajero_nombre, s.nombre AS sucursal_nombre
      FROM egresos_gastos g
      JOIN usuarios u ON g.usuario_id = u.id
      JOIN sucursales s ON g.sucursal_id = s.id
      ${whereClause}
      ORDER BY g.fecha_gasto DESC, g.id DESC LIMIT 100
    `;

    const [gastos] = await pool.query(query, params);

    // Calcular KPIs del período/sucursal (incluyendo ventas completadas + movimientos manuales)
    let kpiWhereMov = ` WHERE 1=1`;
    let kpiWhereVen = ` WHERE estado = 'completada'`;
    const kpiParamsMov = [];
    const kpiParamsVen = [];

    if (sucursalId) {
      kpiWhereMov += ` AND sucursal_id = ?`;
      kpiWhereVen += ` AND sucursal_id = ?`;
      kpiParamsMov.push(sucursalId);
      kpiParamsVen.push(sucursalId);
    }
    if (fecha_inicio) {
      kpiWhereMov += ` AND DATE(fecha_gasto) >= ?`;
      kpiWhereVen += ` AND DATE(fecha_venta) >= ?`;
      kpiParamsMov.push(fecha_inicio);
      kpiParamsVen.push(fecha_inicio);
    }
    if (fecha_fin) {
      kpiWhereMov += ` AND DATE(fecha_gasto) <= ?`;
      kpiWhereVen += ` AND DATE(fecha_venta) <= ?`;
      kpiParamsMov.push(fecha_fin);
      kpiParamsVen.push(fecha_fin);
    }

    const [resumenMovRows] = await pool.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) AS total_egresos,
        COALESCE(SUM(CASE WHEN tipo = 'egreso' AND metodo_pago = 'efectivo' THEN monto ELSE 0 END), 0) AS total_efectivo_caja,
        COALESCE(SUM(CASE WHEN tipo = 'egreso' AND metodo_pago != 'efectivo' THEN monto ELSE 0 END), 0) AS total_transferencia_qr,
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS total_ingresos_extra,
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' AND metodo_pago = 'efectivo' THEN monto ELSE 0 END), 0) AS total_ingresos_extra_efectivo
       FROM egresos_gastos 
       ${kpiWhereMov}`,
      kpiParamsMov
    );

    const [resumenVenRows] = await pool.query(
      `SELECT
        COALESCE(SUM(monto_total), 0) AS total_ventas,
        COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' THEN monto_total WHEN metodo_pago = 'mixto' THEN monto_total * 0.5 ELSE 0 END), 0) AS total_ventas_efectivo
       FROM ventas
       ${kpiWhereVen}`,
      kpiParamsVen
    );

    const totalVentas = parseFloat(resumenVenRows[0].total_ventas || 0);
    const totalVentasEf = parseFloat(resumenVenRows[0].total_ventas_efectivo || 0);
    const totalIngresosExtra = parseFloat(resumenMovRows[0].total_ingresos_extra || 0);
    const totalIngresosExtraEf = parseFloat(resumenMovRows[0].total_ingresos_extra_efectivo || 0);
    const totalEgresos = parseFloat(resumenMovRows[0].total_egresos || 0);
    const totalEgresosEf = parseFloat(resumenMovRows[0].total_efectivo_caja || 0);
    const totalEgresosQr = parseFloat(resumenMovRows[0].total_transferencia_qr || 0);

    const totalIngresos = parseFloat((totalVentas + totalIngresosExtra).toFixed(2));
    const saldoNetoCaja = parseFloat((totalIngresos - totalEgresos).toFixed(2));
    const saldoCajaFisica = parseFloat(((totalVentasEf + totalIngresosExtraEf) - totalEgresosEf).toFixed(2));

    const resumen = {
      totalVentas,
      totalIngresosExtra,
      totalIngresos,
      totalEgresos,
      saldoNetoCaja,
      saldoCajaFisica,
      totalGeneral: totalEgresos,
      totalEfectivoCaja: totalEgresosEf,
      totalTransferenciaQR: totalEgresosQr
    };

    return { gastos, resumen };
  }

  /**
   * Abrir caja
   */
  async abrirCaja(sucursalId, usuarioId, montoApertura, observaciones = '') {
    const [activa] = await pool.query(
      `SELECT id FROM arqueos_caja WHERE sucursal_id = ? AND usuario_id = ? AND estado = 'abierta'`,
      [sucursalId, usuarioId]
    );
    if (activa.length > 0) {
      throw new Error('Ya existe una caja abierta para este usuario y sucursal');
    }

    const [res] = await pool.query(
      `INSERT INTO arqueos_caja (sucursal_id, usuario_id, monto_apertura, fecha_apertura, estado, observaciones)
       VALUES (?, ?, ?, NOW(), 'abierta', ?)`,
      [sucursalId, usuarioId, parseFloat(montoApertura || 0), observaciones]
    );

    return { 
      id: res.insertId, 
      monto_apertura: parseFloat(montoApertura || 0),
      montoApertura: parseFloat(montoApertura || 0) 
    };
  }

  /**
   * Registrar movimiento financiero (egreso o ingreso extra)
   */
  async registrarGasto(sucursalId, usuarioId, datosGasto) {
    const {
      tipo = 'egreso',
      categoria_gasto,
      monto,
      comprobante_nro,
      concepto,
      beneficiario,
      metodo_pago = 'efectivo'
    } = datosGasto;

    if (!['egreso', 'ingreso'].includes(tipo)) {
      throw new Error('Tipo de movimiento inválido. Debe ser "egreso" o "ingreso"');
    }

    const categoriasEgreso = [
      'Proveedor', 'Alquiler', 'Servicios Básicos', 'Impuesto RTS', 'Sueldos', 'Viáticos/Otros'
    ];
    const categoriasIngreso = [
      'Reposición de Cambio', 'Aporte de Caja', 'Cobro de Deuda', 'Otro Ingreso'
    ];

    if (tipo === 'egreso' && !categoriasEgreso.includes(categoria_gasto)) {
      throw new Error(`Categoría de egreso inválida. Debe ser una de: ${categoriasEgreso.join(', ')}`);
    }
    if (tipo === 'ingreso' && !categoriasIngreso.includes(categoria_gasto)) {
      throw new Error(`Categoría de ingreso inválida. Debe ser una de: ${categoriasIngreso.join(', ')}`);
    }

    const parsedMonto = parseFloat(monto);
    if (isNaN(parsedMonto) || parsedMonto <= 0) {
      throw new Error('El monto debe ser mayor a Bs. 0.00');
    }

    const [arqueos] = await pool.query(
      `SELECT id FROM arqueos_caja WHERE sucursal_id = ? AND usuario_id = ? AND estado = 'abierta' LIMIT 1`,
      [sucursalId, usuarioId]
    );
    const arqueoId = arqueos.length > 0 ? arqueos[0].id : null;

    const [res] = await pool.query(
      `INSERT INTO egresos_gastos (
        sucursal_id, usuario_id, arqueo_id, tipo, categoria_gasto, monto, comprobante_nro, concepto, beneficiario, metodo_pago, fecha_gasto
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [sucursalId, usuarioId, arqueoId, tipo, categoria_gasto, parsedMonto, comprobante_nro || null, concepto, beneficiario || null, metodo_pago]
    );

    if (arqueoId && metodo_pago === 'efectivo') {
      if (tipo === 'egreso') {
        await pool.query(
          `UPDATE arqueos_caja SET total_gastos = total_gastos + ? WHERE id = ?`,
          [parsedMonto, arqueoId]
        );
      } else {
        await pool.query(
          `UPDATE arqueos_caja SET total_ingresos_extra = total_ingresos_extra + ? WHERE id = ?`,
          [parsedMonto, arqueoId]
        );
      }
    }

    return { id: res.insertId, tipo, categoria_gasto, monto: parsedMonto, metodo_pago, concepto };
  }

  /**
   * Catálogo Maestro de Productos
   */
  async getCatalogoProductos() {
    const [rows] = await pool.query(
      `SELECT p.id, p.codigo_barras, p.nombre, p.descripcion, p.unidad_medida,
              p.contenido_por_caja, p.imagen_url, p.categoria_id, c.nombre AS categoria_nombre
       FROM productos p
       JOIN categorias c ON p.categoria_id = c.id
       WHERE p.estado = 'activo'
       ORDER BY p.nombre ASC`
    );
    return rows;
  }

  /**
   * Listar todos los lotes de inventario (filtrable por sucursal)
   */
  async getLotes(sucursalId = null) {
    let query = `
      SELECT il.*, p.nombre AS producto_nombre, p.codigo_barras, p.unidad_medida,
             c.nombre AS categoria_nombre, s.nombre AS sucursal_nombre, s.codigo AS sucursal_codigo,
             DATEDIFF(il.fecha_vencimiento, CURDATE()) AS dias_restantes
      FROM inventario_lotes il
      JOIN productos p ON il.producto_id = p.id
      JOIN categorias c ON p.categoria_id = c.id
      JOIN sucursales s ON il.sucursal_id = s.id
    `;
    const params = [];
    if (sucursalId) {
      query += ` WHERE il.sucursal_id = ?`;
      params.push(sucursalId);
    }
    query += ` ORDER BY il.created_at DESC, il.id DESC`;

    const [rows] = await pool.query(query, params);
    return rows;
  }

  /**
   * Lotes con control de vencimiento, ofertas y semáforo por fila
   */
  async getVencimientos(sucursalId = null, filtro = 'todos') {
    let query = `
      SELECT il.*, p.nombre AS producto_nombre, p.codigo_barras, p.unidad_medida,
             c.nombre AS categoria_nombre, s.nombre AS sucursal_nombre, s.codigo AS sucursal_codigo,
             DATEDIFF(il.fecha_vencimiento, CURDATE()) AS dias_restantes
      FROM inventario_lotes il
      JOIN productos p ON il.producto_id = p.id
      JOIN categorias c ON p.categoria_id = c.id
      JOIN sucursales s ON il.sucursal_id = s.id
      WHERE il.stock_actual_unidades > 0 AND il.estado = 'activo'
    `;
    const params = [];

    if (sucursalId && sucursalId !== 'todas') {
      query += ` AND il.sucursal_id = ?`;
      params.push(parseInt(sucursalId, 10));
    }

    if (filtro === '14_dias' || filtro === '2_semanas' || filtro === '15_dias') {
      query += ` AND DATEDIFF(il.fecha_vencimiento, CURDATE()) <= 14 AND DATEDIFF(il.fecha_vencimiento, CURDATE()) >= 0`;
    } else if (filtro === '30_dias') {
      query += ` AND DATEDIFF(il.fecha_vencimiento, CURDATE()) <= 30 AND DATEDIFF(il.fecha_vencimiento, CURDATE()) >= 0`;
    } else if (filtro === 'vencidos') {
      query += ` AND DATEDIFF(il.fecha_vencimiento, CURDATE()) <= 0`;
    } else if (filtro === 'en_oferta') {
      query += ` AND il.en_oferta = 1`;
    }

    query += ` ORDER BY dias_restantes ASC, il.fecha_vencimiento ASC`;

    const [rows] = await pool.query(query, params);

    return rows.map(r => {
      const dias = r.dias_restantes !== null ? parseInt(r.dias_restantes, 10) : 999;
      let estado_alerta = 'normal';
      if (dias <= 0) {
        estado_alerta = 'vencido';
      } else if (dias <= 14) {
        estado_alerta = 'critico'; // 1 a 14 días (2 semanas o menos)
      } else if (dias <= 30) {
        estado_alerta = 'alerta'; // 15 a 30 días
      }

      const pNormal = Number(r.precio_venta_normal) || 0;
      const pOferta = r.precio_venta_oferta ? Number(r.precio_venta_oferta) : null;
      const ahorroBs = (r.en_oferta && pOferta) ? parseFloat((pNormal - pOferta).toFixed(2)) : 0;

      return {
        ...r,
        dias_restantes: dias,
        estado_alerta,
        ahorro_bs: ahorroBs
      };
    });
  }

  /**
   * Aplicar oferta / rebaja a un lote
   */
  async aplicarOfertaLote(loteId, data, vendedorSucursalId = null) {
    const { en_oferta, descuento_porcentaje, precio_venta_oferta } = data;

    const [lotes] = await pool.query(
      `SELECT il.*, p.nombre AS producto_nombre
       FROM inventario_lotes il
       JOIN productos p ON il.producto_id = p.id
       WHERE il.id = ?`,
      [loteId]
    );
    if (lotes.length === 0) {
      throw new Error('Lote no encontrado');
    }

    const lote = lotes[0];
    if (vendedorSucursalId && parseInt(lote.sucursal_id, 10) !== parseInt(vendedorSucursalId, 10)) {
      throw new Error('Acceso denegado: No tiene permisos para modificar lotes de otra sucursal');
    }

    const precioNormal = parseFloat(lote.precio_venta_normal);
    let precioOferta = precio_venta_oferta ? parseFloat(precio_venta_oferta) : null;
    let descPct = descuento_porcentaje ? parseFloat(descuento_porcentaje) : 0;

    if (en_oferta && !precioOferta && descPct > 0) {
      precioOferta = parseFloat((precioNormal * (1 - descPct / 100)).toFixed(2));
    } else if (en_oferta && precioOferta && descPct === 0) {
      descPct = parseFloat((((precioNormal - precioOferta) / precioNormal) * 100).toFixed(2));
    }

    await pool.query(
      `UPDATE inventario_lotes 
       SET en_oferta = ?, descuento_porcentaje = ?, precio_venta_oferta = ?
       WHERE id = ?`,
      [en_oferta ? 1 : 0, descPct, en_oferta ? precioOferta : null, loteId]
    );

    await pool.query(
      `UPDATE sucursal_productos 
       SET en_oferta = ?, descuento_porcentaje = ?, precio_venta_oferta = ?
       WHERE sucursal_id = ? AND producto_id = ?`,
      [en_oferta ? 1 : 0, descPct, en_oferta ? precioOferta : null, lote.sucursal_id, lote.producto_id]
    );

    return {
      loteId,
      sucursal_id: lote.sucursal_id,
      numero_lote: lote.numero_lote,
      producto_nombre: lote.producto_nombre,
      en_oferta: !!en_oferta,
      descuento_porcentaje: descPct,
      precio_venta_oferta: precioOferta
    };
  }

  /**
   * Realizar traspaso de mercadería entre tiendas
   */
  async realizarTraspaso(data) {
    const {
      sucursal_origen_id,
      sucursal_destino_id,
      usuario_id,
      producto_id,
      lote_id,
      cantidad,
      motivo = ''
    } = data;

    const origenId = parseInt(sucursal_origen_id, 10);
    const destinoId = parseInt(sucursal_destino_id, 10);
    const cant = parseInt(cantidad, 10);

    if (origenId === destinoId) {
      throw new Error('La sucursal de origen y destino no pueden ser la misma');
    }

    if (isNaN(cant) || cant <= 0) {
      throw new Error('La cantidad a traspasar debe ser mayor a cero');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [spOrigen] = await connection.query(
        `SELECT id, stock_total_unidades FROM sucursal_productos 
         WHERE sucursal_id = ? AND producto_id = ? FOR UPDATE`,
        [origenId, producto_id]
      );

      if (spOrigen.length === 0 || spOrigen[0].stock_total_unidades < cant) {
        throw new Error('Stock insuficiente en la sucursal de origen');
      }

      const [loteOrigen] = await connection.query(
        `SELECT * FROM inventario_lotes WHERE id = ? AND sucursal_id = ? FOR UPDATE`,
        [lote_id, origenId]
      );

      if (loteOrigen.length === 0 || loteOrigen[0].stock_actual_unidades < cant) {
        throw new Error('Stock insuficiente en el lote de origen seleccionado');
      }

      const loteOrig = loteOrigen[0];

      await connection.query(
        `UPDATE inventario_lotes 
         SET stock_actual_unidades = stock_actual_unidades - ?,
             estado = CASE WHEN stock_actual_unidades - ? = 0 THEN 'agotado' ELSE 'activo' END
         WHERE id = ?`,
        [cant, cant, lote_id]
      );

      await connection.query(
        `UPDATE sucursal_productos 
         SET stock_total_unidades = stock_total_unidades - ?
         WHERE sucursal_id = ? AND producto_id = ?`,
        [cant, origenId, producto_id]
      );

      const [resLoteDestino] = await connection.query(
        `INSERT INTO inventario_lotes (
          sucursal_id, producto_id, numero_lote, unidades_por_caja, cajas_compradas,
          unidades_totales_ingresadas, costo_caja, costo_unitario, precio_venta_normal,
          en_oferta, precio_venta_oferta, stock_actual_unidades, fecha_ingreso,
          fecha_vencimiento, proveedor, observaciones, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, 'activo')`,
        [
          destinoId, producto_id, `${loteOrig.numero_lote}-TRASP`, loteOrig.unidades_por_caja,
          (cant / loteOrig.unidades_por_caja).toFixed(2), cant, loteOrig.costo_caja,
          loteOrig.costo_unitario, loteOrig.precio_venta_normal, loteOrig.en_oferta,
          loteOrig.precio_venta_oferta, cant, loteOrig.fecha_vencimiento,
          `Traspaso desde Sucursal ${origenId}`, `Traspaso: ${motivo}`
        ]
      );

      const [spDestino] = await connection.query(
        `SELECT id FROM sucursal_productos WHERE sucursal_id = ? AND producto_id = ? LIMIT 1`,
        [destinoId, producto_id]
      );

      if (spDestino.length > 0) {
        await connection.query(
          `UPDATE sucursal_productos 
           SET stock_total_unidades = stock_total_unidades + ?
           WHERE id = ?`,
          [cant, spDestino[0].id]
        );
      } else {
        await connection.query(
          `INSERT INTO sucursal_productos (
            sucursal_id, producto_id, precio_venta_normal, stock_total_unidades, stock_minimo_alerta, estado
          ) VALUES (?, ?, ?, ?, 10, 'activo')`,
          [destinoId, producto_id, loteOrig.precio_venta_normal, cant]
        );
      }

      const [countTraspaso] = await connection.query(`SELECT COUNT(*) AS total FROM traspasos_sucursales`);
      const codigoTraspaso = `TRASP-${String(countTraspaso[0].total + 1).padStart(5, '0')}`;

      await connection.query(
        `INSERT INTO traspasos_sucursales (
          numero_traspaso, sucursal_origen_id, sucursal_destino_id, usuario_envia_id,
          producto_id, lote_id, cantidad_unidades, estado, motivo, fecha_envio
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completado', ?, NOW())`,
        [codigoTraspaso, origenId, destinoId, usuario_id, producto_id, lote_id, cant, motivo]
      );

      await connection.commit();

      return {
        codigoTraspaso,
        sucursalOrigenId: origenId,
        sucursalDestinoId: destinoId,
        productoId: producto_id,
        cantidad: cant,
        nuevoLoteDestinoId: resLoteDestino.insertId
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Obtener historial de traspasos entre tiendas
   */
  async getTraspasos(sucursalId = null) {
    let query = `
      SELECT ts.*, p.nombre AS producto_nombre, p.codigo_barras,
             so.nombre AS sucursal_origen_nombre, so.codigo AS sucursal_origen_codigo,
             sd.nombre AS sucursal_destino_nombre, sd.codigo AS sucursal_destino_codigo,
             u.nombre AS usuario_envia_nombre
      FROM traspasos_sucursales ts
      JOIN productos p ON ts.producto_id = p.id
      JOIN sucursales so ON ts.sucursal_origen_id = so.id
      JOIN sucursales sd ON ts.sucursal_destino_id = sd.id
      JOIN usuarios u ON ts.usuario_envia_id = u.id
    `;
    const params = [];
    if (sucursalId) {
      query += ` WHERE ts.sucursal_origen_id = ? OR ts.sucursal_destino_id = ?`;
      params.push(sucursalId, sucursalId);
    }
    query += ` ORDER BY ts.fecha_solicitud DESC, ts.id DESC LIMIT 50`;

    const [rows] = await pool.query(query, params);
    return rows;
  }

  /**
   * NUEVO: Obtener inventario detallado de una sucursal con KPIs y cálculos enriquecidos
   */
  async getInventarioSucursal(sucursalId, options = {}) {
    const { busqueda = '', categoriaId = null, estado = 'todos' } = options;

    // 1. KPIs de la Sucursal
    const [kpiRows1] = await pool.query(
      `SELECT 
        COUNT(*) AS total_productos,
        COUNT(CASE WHEN stock_total_unidades <= stock_minimo_alerta THEN 1 END) AS alertas_stock_bajo
       FROM sucursal_productos
       WHERE sucursal_id = ? AND estado = 'activo'`,
      [sucursalId]
    );

    const [kpiRows2] = await pool.query(
      `SELECT 
        COALESCE(SUM(stock_actual_unidades * costo_unitario), 0) AS capital_invertido,
        COUNT(CASE WHEN fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 END) AS lotes_por_vencer
       FROM inventario_lotes
       WHERE sucursal_id = ? AND stock_actual_unidades > 0 AND estado = 'activo'`,
      [sucursalId]
    );

    const kpis = {
      totalProductos: kpiRows1[0].total_productos || 0,
      alertasStockBajo: kpiRows1[0].alertas_stock_bajo || 0,
      capitalInvertido: parseFloat(parseFloat(kpiRows2[0].capital_invertido || 0).toFixed(2)),
      lotesPorVencer: kpiRows2[0].lotes_por_vencer || 0
    };

    // 2. Consulta de Productos Enriquecida
    let query = `
      SELECT 
        p.id, p.codigo_barras, p.nombre, p.descripcion, p.unidad_medida, p.contenido_por_caja, p.imagen_url,
        c.id AS categoria_id, c.nombre AS categoria_nombre, c.color AS categoria_color,
        sp.id AS sucursal_producto_id, sp.sucursal_id,
        sp.precio_venta_normal, sp.en_oferta, sp.descuento_porcentaje, sp.precio_venta_oferta,
        CASE WHEN sp.en_oferta = 1 AND sp.precio_venta_oferta IS NOT NULL THEN sp.precio_venta_oferta ELSE sp.precio_venta_normal END AS precio_vigente,
        sp.stock_total_unidades, sp.stock_minimo_alerta,
        COALESCE(costos.costo_unitario_promedio, 0.00) AS costo_unitario_promedio,
        prox.proximo_lote,
        prox.proximo_vencimiento,
        DATEDIFF(prox.proximo_vencimiento, CURDATE()) AS dias_para_vencer,
        COALESCE(prox.total_lotes_activos, 0) AS lotes_activos
      FROM sucursal_productos sp
      JOIN productos p ON sp.producto_id = p.id
      JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN (
        SELECT 
          producto_id, sucursal_id,
          ROUND(SUM(stock_actual_unidades * costo_unitario) / NULLIF(SUM(stock_actual_unidades), 0), 2) AS costo_unitario_promedio
        FROM inventario_lotes
        WHERE stock_actual_unidades > 0 AND estado = 'activo'
        GROUP BY producto_id, sucursal_id
      ) costos ON sp.producto_id = costos.producto_id AND sp.sucursal_id = costos.sucursal_id
      LEFT JOIN (
        SELECT 
          il.producto_id, il.sucursal_id,
          COUNT(*) AS total_lotes_activos,
          SUBSTRING_INDEX(GROUP_CONCAT(il.numero_lote ORDER BY il.fecha_vencimiento ASC), ',', 1) AS proximo_lote,
          MIN(il.fecha_vencimiento) AS proximo_vencimiento
        FROM inventario_lotes il
        WHERE il.stock_actual_unidades > 0 AND il.estado = 'activo'
        GROUP BY il.producto_id, il.sucursal_id
      ) prox ON sp.producto_id = prox.producto_id AND sp.sucursal_id = prox.sucursal_id
      WHERE sp.sucursal_id = ? AND sp.estado = 'activo' AND p.estado = 'activo'
    `;

    const params = [sucursalId];

    if (categoriaId) {
      query += ` AND c.id = ?`;
      params.push(categoriaId);
    }

    if (busqueda.trim()) {
      query += ` AND (p.nombre LIKE ? OR p.codigo_barras LIKE ?)`;
      params.push(`%${busqueda.trim()}%`, `%${busqueda.trim()}%`);
    }

    if (estado === 'stock_bajo') {
      query += ` AND sp.stock_total_unidades <= sp.stock_minimo_alerta`;
    } else if (estado === 'en_oferta') {
      query += ` AND sp.en_oferta = 1`;
    }

    query += ` ORDER BY p.nombre ASC`;

    const [rows] = await pool.query(query, params);

    // Calcular equivalencias en cajas y margen
    const productosEnriquecidos = rows.map((it) => {
      const stock = parseInt(it.stock_total_unidades, 10) || 0;
      const uPorCaja = parseInt(it.contenido_por_caja, 10) || 1;
      const cajasEnteras = Math.floor(stock / uPorCaja);
      const sueltas = stock % uPorCaja;

      let stockEquivalente = '';
      if (uPorCaja > 1) {
        if (cajasEnteras > 0 && sueltas > 0) {
          stockEquivalente = `${cajasEnteras} caja${cajasEnteras > 1 ? 's' : ''} + ${sueltas} u.`;
        } else if (cajasEnteras > 0) {
          stockEquivalente = `${cajasEnteras} caja${cajasEnteras > 1 ? 's' : ''}`;
        } else {
          stockEquivalente = `${sueltas} u.`;
        }
      } else {
        stockEquivalente = `${stock} u.`;
      }

      const precioVigente = parseFloat(it.precio_vigente) || 0;
      const costoUnitario = parseFloat(it.costo_unitario_promedio) || 0;
      const margenPorcentaje = precioVigente > 0 
        ? parseFloat((((precioVigente - costoUnitario) / precioVigente) * 100).toFixed(1))
        : 0;

      return {
        ...it,
        stock_cajas: cajasEnteras,
        stock_sueltas: sueltas,
        stock_equivalente: stockEquivalente,
        margen_porcentaje: margenPorcentaje
      };
    });

    return {
      kpis,
      productos: productosEnriquecidos
    };
  }

  /**
   * NUEVO: Crear nuevo producto en catálogo y registrarlo en sucursales
   */
  async crearProducto(datos) {
    const {
      codigo_barras,
      nombre,
      descripcion = '',
      categoria_id,
      unidad_medida = 'Unidad',
      contenido_por_caja = 1,
      precio_venta_normal = 0.00,
      stock_minimo_alerta = 10,
      imagen_url = null
    } = datos;

    if (!codigo_barras || !nombre || !categoria_id) {
      throw new Error('Código de barras, nombre y categoría son requeridos');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Insertar en tabla productos
      const [resProd] = await connection.query(
        `INSERT INTO productos (
          codigo_barras, nombre, descripcion, categoria_id, unidad_medida, contenido_por_caja, imagen_url, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'activo')`,
        [codigo_barras, nombre, descripcion, categoria_id, unidad_medida, parseInt(contenido_por_caja, 10) || 1, imagen_url]
      );
      const productoId = resProd.insertId;

      // 2. Asociar a todas las sucursales existentes con stock inicial 0
      const [sucursales] = await connection.query(`SELECT id FROM sucursales WHERE estado = 'activo'`);
      for (const suc of sucursales) {
        await connection.query(
          `INSERT INTO sucursal_productos (
            sucursal_id, producto_id, precio_venta_normal, en_oferta, descuento_porcentaje, precio_venta_oferta, stock_total_unidades, stock_minimo_alerta, estado
          ) VALUES (?, ?, ?, 0, 0.00, NULL, 0, ?, 'activo')`,
          [suc.id, productoId, parseFloat(precio_venta_normal) || 0.00, parseInt(stock_minimo_alerta, 10) || 10]
        );
      }

      await connection.commit();

      return {
        productoId,
        codigo_barras,
        nombre,
        sucursalesHabilitadas: sucursales.length
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * NUEVO: Obtener los lotes activos de un producto en una sucursal específica
   */
  async getLotesProducto(sucursalId, productoId) {
    const [lotes] = await pool.query(
      `SELECT 
        il.*,
        p.nombre AS producto_nombre, p.codigo_barras, p.unidad_medida, p.contenido_por_caja,
        s.nombre AS sucursal_nombre,
        DATEDIFF(il.fecha_vencimiento, CURDATE()) AS dias_para_vencer,
        CASE 
          WHEN DATEDIFF(il.fecha_vencimiento, CURDATE()) < 0 THEN 'vencido'
          WHEN DATEDIFF(il.fecha_vencimiento, CURDATE()) <= 15 THEN 'critico'
          WHEN DATEDIFF(il.fecha_vencimiento, CURDATE()) <= 30 THEN 'alerta'
          ELSE 'normal'
        END AS nivel_alerta
       FROM inventario_lotes il
       JOIN productos p ON il.producto_id = p.id
       JOIN sucursales s ON il.sucursal_id = s.id
       WHERE il.sucursal_id = ? AND il.producto_id = ? AND il.stock_actual_unidades > 0 AND il.estado = 'activo'
       ORDER BY il.fecha_vencimiento ASC, il.id ASC`,
      [sucursalId, productoId]
    );

    return lotes;
  }

  /**
   * NUEVO: Actualizar precio de venta y estado de oferta en sucursal_productos
   */
  async actualizarPrecioOferta(sucursalId, productoId, datos) {
    const {
      precio_venta_normal,
      en_oferta = 0,
      descuento_porcentaje = 0,
      precio_venta_oferta = null
    } = datos;

    const normal = parseFloat(precio_venta_normal);
    if (isNaN(normal) || normal < 0) {
      throw new Error('Debe ingresar un precio de venta normal válido');
    }

    const ofertaActiva = en_oferta === 1 || en_oferta === true;
    let precioOferta = null;
    let descPct = 0;

    if (ofertaActiva) {
      if (precio_venta_oferta !== null && precio_venta_oferta !== undefined && parseFloat(precio_venta_oferta) > 0) {
        precioOferta = parseFloat(precio_venta_oferta);
        descPct = normal > 0 ? parseFloat((((normal - precioOferta) / normal) * 100).toFixed(2)) : 0;
      } else if (descuento_porcentaje && parseFloat(descuento_porcentaje) > 0) {
        descPct = parseFloat(descuento_porcentaje);
        precioOferta = parseFloat((normal * (1 - descPct / 100)).toFixed(2));
      } else {
        throw new Error('Debe especificar un porcentaje o precio de oferta válido');
      }
    }

    await pool.query(
      `UPDATE sucursal_productos 
       SET precio_venta_normal = ?, en_oferta = ?, descuento_porcentaje = ?, precio_venta_oferta = ?
       WHERE sucursal_id = ? AND producto_id = ?`,
      [normal, ofertaActiva ? 1 : 0, descPct, precioOferta, sucursalId, productoId]
    );

    return {
      sucursalId,
      productoId,
      precio_venta_normal: normal,
      en_oferta: ofertaActiva ? 1 : 0,
      descuento_porcentaje: descPct,
      precio_venta_oferta: precioOferta
    };
  }

  /**
   * NUEVO: Registrar ajuste físico de stock (Merma, daño, conteo físico o corrección)
   */
  async ajustarStock(sucursalId, productoId, usuarioId, datos) {
    const { tipo_ajuste, nuevo_stock, motivo } = datos;

    if (!motivo || motivo.trim().length < 4) {
      throw new Error('El motivo del ajuste de stock es obligatorio (mínimo 4 caracteres)');
    }

    const stockNuevo = parseInt(nuevo_stock, 10);
    if (isNaN(stockNuevo) || stockNuevo < 0) {
      throw new Error('El nuevo stock físico debe ser un número entero mayor o igual a 0');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Obtener stock anterior con bloqueo
      const [spRows] = await connection.query(
        `SELECT id, stock_total_unidades FROM sucursal_productos 
         WHERE sucursal_id = ? AND producto_id = ? FOR UPDATE`,
        [sucursalId, productoId]
      );

      if (spRows.length === 0) {
        throw new Error('El producto no está registrado en esta sucursal');
      }

      const stockAnterior = spRows[0].stock_total_unidades;
      const diferencia = stockNuevo - stockAnterior;

      if (diferencia === 0) {
        throw new Error('El stock ingresado es idéntico al stock actual en sistema');
      }

      // 2. Actualizar stock en sucursal_productos
      await connection.query(
        `UPDATE sucursal_productos SET stock_total_unidades = ? WHERE sucursal_id = ? AND producto_id = ?`,
        [stockNuevo, sucursalId, productoId]
      );

      // 3. Ajustar en inventario_lotes
      if (diferencia < 0) {
        // Reducción por merma o faltante (descontar FIFO de los lotes más antiguos/próximos a vencer)
        let pendienteDescontar = Math.abs(diferencia);
        const [lotes] = await connection.query(
          `SELECT id, stock_actual_unidades FROM inventario_lotes 
           WHERE sucursal_id = ? AND producto_id = ? AND stock_actual_unidades > 0 AND estado = 'activo'
           ORDER BY fecha_vencimiento ASC, id ASC FOR UPDATE`,
          [sucursalId, productoId]
        );

        for (const l of lotes) {
          if (pendienteDescontar <= 0) break;
          const aDescontar = Math.min(l.stock_actual_unidades, pendienteDescontar);
          const newStockLote = l.stock_actual_unidades - aDescontar;
          await connection.query(
            `UPDATE inventario_lotes SET stock_actual_unidades = ?, estado = CASE WHEN ? = 0 THEN 'agotado' ELSE 'activo' END WHERE id = ?`,
            [newStockLote, newStockLote, l.id]
          );
          pendienteDescontar -= aDescontar;
        }
      } else {
        // Incremento por sobrante de conteo (sumar al lote más reciente o crear uno de ajuste)
        const [lotes] = await connection.query(
          `SELECT id, stock_actual_unidades FROM inventario_lotes 
           WHERE sucursal_id = ? AND producto_id = ? AND estado = 'activo'
           ORDER BY id DESC LIMIT 1 FOR UPDATE`,
          [sucursalId, productoId]
        );

        if (lotes.length > 0) {
          await connection.query(
            `UPDATE inventario_lotes SET stock_actual_unidades = stock_actual_unidades + ? WHERE id = ?`,
            [diferencia, lotes[0].id]
          );
        }
      }

      // 4. Registrar en tabla de auditoría ajustes_stock
      const [resAjuste] = await connection.query(
        `INSERT INTO ajustes_stock (
          sucursal_id, producto_id, usuario_id, tipo_ajuste, stock_anterior, stock_nuevo, diferencia, motivo, fecha_ajuste
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [sucursalId, productoId, usuarioId, tipo_ajuste || 'conteo_fisico', stockAnterior, stockNuevo, diferencia, motivo]
      );

      await connection.commit();

      return {
        ajusteId: resAjuste.insertId,
        sucursalId,
        productoId,
        stockAnterior,
        stockNuevo,
        diferencia,
        motivo,
        tipo_ajuste: tipo_ajuste || 'conteo_fisico'
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

module.exports = new InventarioService();
