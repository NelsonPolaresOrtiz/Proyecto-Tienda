const { pool } = require('../config/db');

class DashboardService {
  /**
   * Obtener métricas consolidadas o por sucursal específica para el Dashboard
   * @param {number|null} sucursalId - ID de la sucursal o null para consolidado de todas las tiendas
   */
  async getDashboardData(sucursalId = null) {
    const isConsolidado = !sucursalId || sucursalId === 'todas';
    const parsedSucursalId = isConsolidado ? null : parseInt(sucursalId, 10);

    // 1. Nombre de la sucursal seleccionada
    let sucursalInfo = { id: null, nombre: 'Todas las Tiendas (Consolidado)' };
    if (parsedSucursalId) {
      const [sucRow] = await pool.query('SELECT id, nombre, codigo FROM sucursales WHERE id = ?', [parsedSucursalId]);
      if (sucRow.length > 0) {
        sucursalInfo = sucRow[0];
      }
    }

    // 2. KPIs de Ventas
    let sqlVentas = `
      SELECT 
        COALESCE(SUM(monto_total), 0) AS ventas_totales,
        COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' THEN monto_total WHEN metodo_pago = 'mixto' THEN monto_total * 0.5 ELSE 0 END), 0) AS total_efectivo,
        COALESCE(SUM(CASE WHEN metodo_pago = 'qr_simple' THEN monto_total WHEN metodo_pago = 'mixto' THEN monto_total * 0.5 ELSE 0 END), 0) AS total_qr,
        COALESCE(SUM(CASE WHEN metodo_pago = 'tarjeta' THEN monto_total ELSE 0 END), 0) AS total_tarjeta,
        COUNT(*) AS total_transacciones,
        COALESCE(AVG(monto_total), 0) AS ticket_promedio
      FROM ventas
      WHERE estado = 'completada'
    `;
    const paramsVentas = [];
    if (parsedSucursalId) {
      sqlVentas += ` AND sucursal_id = ?`;
      paramsVentas.push(parsedSucursalId);
    }
    const [kpiVentasRows] = await pool.query(sqlVentas, paramsVentas);
    const kpiVentas = kpiVentasRows[0];

    // 3. KPIs de Gastos
    let sqlGastos = `
      SELECT 
        COALESCE(SUM(monto), 0) AS gastos_totales,
        COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' THEN monto ELSE 0 END), 0) AS gastos_efectivo,
        COALESCE(SUM(CASE WHEN metodo_pago != 'efectivo' THEN monto ELSE 0 END), 0) AS gastos_transferencia,
        COUNT(*) AS total_registros_gastos
      FROM egresos_gastos
      WHERE tipo = 'egreso'
    `;
    const paramsGastos = [];
    if (parsedSucursalId) {
      sqlGastos += ` AND sucursal_id = ?`;
      paramsGastos.push(parsedSucursalId);
    }
    const [kpiGastosRows] = await pool.query(sqlGastos, paramsGastos);
    const kpiGastos = kpiGastosRows[0];

    const ventasTotalesNum = parseFloat(kpiVentas.ventas_totales) || 0;
    const gastosTotalesNum = parseFloat(kpiGastos.gastos_totales) || 0;
    const utilidadNetaNum = parseFloat((ventasTotalesNum - gastosTotalesNum).toFixed(2));
    const margenUtilidad = ventasTotalesNum > 0 ? parseFloat(((utilidadNetaNum / ventasTotalesNum) * 100).toFixed(1)) : 0;

    // 4. Ventas por Día (Últimos 14 días con actividad)
    let sqlVentasDia = `
      SELECT 
        DATE_FORMAT(fecha_venta, '%Y-%m-%d') AS fecha,
        DATE_FORMAT(fecha_venta, '%d/%m') AS fecha_corta,
        COALESCE(SUM(monto_total), 0) AS total,
        COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' THEN monto_total WHEN metodo_pago = 'mixto' THEN monto_total * 0.5 ELSE 0 END), 0) AS efectivo,
        COALESCE(SUM(CASE WHEN metodo_pago = 'qr_simple' THEN monto_total WHEN metodo_pago = 'mixto' THEN monto_total * 0.5 ELSE 0 END), 0) AS qr,
        COUNT(*) AS transacciones
      FROM ventas
      WHERE estado = 'completada' AND fecha_venta >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
    `;
    const paramsVentasDia = [];
    if (parsedSucursalId) {
      sqlVentasDia += ` AND sucursal_id = ?`;
      paramsVentasDia.push(parsedSucursalId);
    }
    sqlVentasDia += ` GROUP BY DATE_FORMAT(fecha_venta, '%Y-%m-%d'), DATE_FORMAT(fecha_venta, '%d/%m') ORDER BY fecha ASC`;
    const [ventasPorDia] = await pool.query(sqlVentasDia, paramsVentasDia);

    // 5. Distribución de Métodos de Pago
    let sqlDist = `
      SELECT 
        metodo_pago,
        COUNT(*) AS total_operaciones,
        COALESCE(SUM(monto_total), 0) AS monto_total
      FROM ventas
      WHERE estado = 'completada'
    `;
    const paramsDist = [];
    if (parsedSucursalId) {
      sqlDist += ` AND sucursal_id = ?`;
      paramsDist.push(parsedSucursalId);
    }
    sqlDist += ` GROUP BY metodo_pago`;
    const [distribucionPagos] = await pool.query(sqlDist, paramsDist);

    // 6. Top Productos Más Vendidos
    let sqlTop = `
      SELECT 
        p.id,
        p.nombre,
        c.nombre AS categoria,
        c.color AS categoria_color,
        COALESCE(SUM(vd.cantidad), 0) AS unidades_vendidas,
        COALESCE(SUM(vd.subtotal), 0) AS ingresos_totales
      FROM venta_detalles vd
      JOIN ventas v ON vd.venta_id = v.id
      JOIN productos p ON vd.producto_id = p.id
      JOIN categorias c ON p.categoria_id = c.id
      WHERE v.estado = 'completada'
    `;
    const paramsTop = [];
    if (parsedSucursalId) {
      sqlTop += ` AND v.sucursal_id = ?`;
      paramsTop.push(parsedSucursalId);
    }
    sqlTop += ` GROUP BY p.id, p.nombre, c.nombre, c.color ORDER BY unidades_vendidas DESC, ingresos_totales DESC LIMIT 5`;
    const [topProductos] = await pool.query(sqlTop, paramsTop);

    // 7. Alertas: Próximos a Vencer (<= 30 días o ya vencidos)
    let sqlVenc = `
      SELECT 
        il.id, il.numero_lote, il.fecha_vencimiento, il.stock_actual_unidades,
        il.en_oferta, il.precio_venta_normal, il.precio_venta_oferta,
        p.nombre AS producto_nombre, p.codigo_barras,
        s.nombre AS sucursal_nombre,
        DATEDIFF(il.fecha_vencimiento, CURDATE()) AS dias_para_vencer
      FROM inventario_lotes il
      JOIN productos p ON il.producto_id = p.id
      JOIN sucursales s ON il.sucursal_id = s.id
      WHERE il.stock_actual_unidades > 0 AND il.estado = 'activo'
        AND il.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
    `;
    const paramsVenc = [];
    if (parsedSucursalId) {
      sqlVenc += ` AND il.sucursal_id = ?`;
      paramsVenc.push(parsedSucursalId);
    }
    sqlVenc += ` ORDER BY il.fecha_vencimiento ASC LIMIT 8`;
    const [alertasVencimiento] = await pool.query(sqlVenc, paramsVenc);

    // 8. Alertas: Stock Bajo (stock actual <= stock mínimo de alerta)
    let sqlStock = `
      SELECT 
        sp.id, sp.producto_id, sp.stock_total_unidades, sp.stock_minimo_alerta,
        sp.precio_venta_normal,
        p.nombre AS producto_nombre, p.codigo_barras, p.unidad_medida,
        s.nombre AS sucursal_nombre,
        c.nombre AS categoria_nombre
      FROM sucursal_productos sp
      JOIN productos p ON sp.producto_id = p.id
      JOIN sucursales s ON sp.sucursal_id = s.id
      JOIN categorias c ON p.categoria_id = c.id
      WHERE sp.stock_total_unidades <= sp.stock_minimo_alerta AND sp.estado = 'activo'
    `;
    const paramsStock = [];
    if (parsedSucursalId) {
      sqlStock += ` AND sp.sucursal_id = ?`;
      paramsStock.push(parsedSucursalId);
    }
    sqlStock += ` ORDER BY sp.stock_total_unidades ASC LIMIT 8`;
    const [alertasStock] = await pool.query(sqlStock, paramsStock);

    return {
      sucursal: sucursalInfo,
      kpis: {
        ventasTotales: ventasTotalesNum,
        totalEfectivo: parseFloat(kpiVentas.total_efectivo) || 0,
        totalQR: parseFloat(kpiVentas.total_qr) || 0,
        totalTarjeta: parseFloat(kpiVentas.total_tarjeta) || 0,
        gastosOperativos: gastosTotalesNum,
        gastosEfectivo: parseFloat(kpiGastos.gastos_efectivo) || 0,
        gastosTransferencia: parseFloat(kpiGastos.gastos_transferencia) || 0,
        utilidadNeta: utilidadNetaNum,
        margenUtilidad,
        totalTransacciones: parseInt(kpiVentas.total_transacciones, 10) || 0,
        ticketPromedio: parseFloat(parseFloat(kpiVentas.ticket_promedio || 0).toFixed(2))
      },
      ventasPorDia,
      distribucionPagos,
      topProductos,
      alertas: {
        proximosVencer: alertasVencimiento,
        stockBajo: alertasStock
      }
    };
  }
}

module.exports = new DashboardService();
