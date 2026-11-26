const { pool } = require('../config/db');

class SucursalService {
  /**
   * Obtener todas las sucursales con métricas operativas en vivo
   */
  async getAllSucursales(includeInactive = false) {
    const whereClause = includeInactive ? '' : "WHERE s.estado = 'activo'";
    const query = `
      SELECT 
        s.*,
        COALESCE((SELECT SUM(monto_total) FROM ventas WHERE sucursal_id = s.id AND estado = 'completada' AND DATE(fecha_venta) = CURDATE()), 0) AS ventas_hoy_bs,
        COALESCE((SELECT COUNT(*) FROM ventas WHERE sucursal_id = s.id AND estado = 'completada' AND DATE(fecha_venta) = CURDATE()), 0) AS transacciones_hoy,
        COALESCE((SELECT COUNT(*) FROM sucursal_productos WHERE sucursal_id = s.id AND stock_total_unidades > 0), 0) AS productos_con_stock,
        COALESCE((SELECT COUNT(*) FROM sucursal_productos WHERE sucursal_id = s.id), 0) AS total_productos,
        COALESCE((SELECT COUNT(*) FROM usuarios WHERE sucursal_id = s.id AND estado = 'activo'), 0) AS personal_count,
        COALESCE((SELECT GROUP_CONCAT(nombre SEPARATOR ', ') FROM usuarios WHERE sucursal_id = s.id AND estado = 'activo'), '') AS personal_nombres,
        CASE WHEN ac.arqueo_id IS NOT NULL THEN 'abierto' ELSE 'cerrado' END AS caja_estado,
        ac.cajero_en_turno,
        ac.fecha_apertura AS caja_fecha_apertura
      FROM sucursales s
      LEFT JOIN (
        SELECT a.sucursal_id, a.id AS arqueo_id, a.fecha_apertura, u.nombre AS cajero_en_turno
        FROM arqueos_caja a
        JOIN usuarios u ON a.usuario_id = u.id
        WHERE a.estado = 'abierta'
      ) ac ON ac.sucursal_id = s.id
      ${whereClause}
      ORDER BY s.es_matriz DESC, s.nombre ASC
    `;
    const [rows] = await pool.query(query);
    return rows;
  }

  /**
   * Obtener sucursal por ID con métricas rápidas
   */
  async getSucursalById(id) {
    const [rows] = await pool.query(
      `SELECT * FROM sucursales WHERE id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      throw new Error('Sucursal no encontrada');
    }
    return rows[0];
  }

  /**
   * Crear nueva sucursal y replicar productos del catálogo con stock inicial cero
   */
  async createSucursal(data) {
    const { nombre, codigo, ciudad, direccion, telefono, es_matriz } = data;

    if (!nombre || !codigo || !direccion) {
      throw new Error('Nombre, código y dirección son obligatorios para la sucursal');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Verificar código único
      const [existing] = await connection.query(
        `SELECT id FROM sucursales WHERE codigo = ? LIMIT 1`,
        [codigo.trim().toUpperCase()]
      );
      if (existing.length > 0) {
        throw new Error(`El código de sucursal ${codigo} ya está registrado`);
      }

      // Si es_matriz es 1, verificar que no haya otra matriz activa
      if (es_matriz) {
        await connection.query(`UPDATE sucursales SET es_matriz = 0 WHERE es_matriz = 1`);
      }

      const [res] = await connection.query(
        `INSERT INTO sucursales (nombre, codigo, ciudad, direccion, telefono, es_matriz, estado)
         VALUES (?, ?, ?, ?, ?, ?, 'activo')`,
        [nombre.trim(), codigo.trim().toUpperCase(), ciudad || 'La Paz', direccion.trim(), telefono || null, es_matriz ? 1 : 0]
      );

      const newSucursalId = res.insertId;

      // Replicar catálogo base de productos a la nueva sucursal con stock 0
      const [productos] = await connection.query(
        `SELECT id, 4.00 AS precio_base FROM productos WHERE estado = 'activo'`
      );

      if (productos.length > 0) {
        const sucursalProds = productos.map(p => [newSucursalId, p.id, p.precio_base, 0, null, 0, 10]);
        await connection.query(
          `INSERT INTO sucursal_productos (sucursal_id, producto_id, precio_venta_normal, en_oferta, precio_venta_oferta, stock_total_unidades, stock_minimo_alerta)
           VALUES ?`,
          [sucursalProds]
        );
      }

      await connection.commit();
      return this.getSucursalById(newSucursalId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Actualizar datos de una sucursal existente
   */
  async updateSucursal(id, data) {
    const sucursal = await this.getSucursalById(id);
    const { nombre, codigo, ciudad, direccion, telefono, es_matriz, estado } = data;

    if (codigo && codigo.trim().toUpperCase() !== sucursal.codigo) {
      const [existing] = await pool.query(
        `SELECT id FROM sucursales WHERE codigo = ? AND id != ? LIMIT 1`,
        [codigo.trim().toUpperCase(), id]
      );
      if (existing.length > 0) {
        throw new Error(`El código ${codigo} ya está asignado a otra sucursal`);
      }
    }

    if (es_matriz && !sucursal.es_matriz) {
      await pool.query(`UPDATE sucursales SET es_matriz = 0 WHERE es_matriz = 1`);
    }

    await pool.query(
      `UPDATE sucursales 
       SET nombre = ?, codigo = ?, ciudad = ?, direccion = ?, telefono = ?, es_matriz = ?, estado = ?
       WHERE id = ?`,
      [
        nombre ? nombre.trim() : sucursal.nombre,
        codigo ? codigo.trim().toUpperCase() : sucursal.codigo,
        ciudad || sucursal.ciudad,
        direccion ? direccion.trim() : sucursal.direccion,
        telefono !== undefined ? telefono : sucursal.telefono,
        es_matriz !== undefined ? (es_matriz ? 1 : 0) : sucursal.es_matriz,
        estado || sucursal.estado,
        id
      ]
    );

    return this.getSucursalById(id);
  }

  /**
   * Obtener resumen general de sucursales para el Dashboard
   */
  async getDashboardSummary(sucursalId = null) {
    // Si sucursalId es provisto (filtro específico) o null (todas)
    let branchFilterVentas = '';
    let branchFilterGastos = '';
    let branchFilterLotes = '';
    let params = [];

    if (sucursalId) {
      branchFilterVentas = 'WHERE sucursal_id = ?';
      branchFilterGastos = 'WHERE sucursal_id = ?';
      branchFilterLotes = 'WHERE sucursal_id = ?';
      params = [sucursalId];
    }

    // 1. Ventas de hoy en Bolivianos (Bs.)
    const [ventasHoy] = await pool.query(
      `SELECT COUNT(*) AS total_transacciones, 
              COALESCE(SUM(monto_total), 0) AS total_bs,
              COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' THEN monto_total ELSE 0 END), 0) AS total_efectivo_bs,
              COALESCE(SUM(CASE WHEN metodo_pago = 'qr_simple' THEN monto_total ELSE 0 END), 0) AS total_qr_bs,
              COALESCE(SUM(CASE WHEN metodo_pago = 'tarjeta' THEN monto_total ELSE 0 END), 0) AS total_tarjeta_bs
       FROM ventas 
       ${branchFilterVentas ? branchFilterVentas + ' AND' : 'WHERE'} estado = 'completada' 
       AND DATE(fecha_venta) = CURDATE()`,
      params
    );

    // 2. Gastos del mes en Bolivianos (Bs.)
    const [gastosMes] = await pool.query(
      `SELECT COALESCE(SUM(monto), 0) AS total_gastos_bs
       FROM egresos_gastos 
       ${branchFilterGastos ? branchFilterGastos + " AND tipo = 'egreso' AND" : "WHERE tipo = 'egreso' AND"} MONTH(fecha_gasto) = MONTH(CURDATE()) AND YEAR(fecha_gasto) = YEAR(CURDATE())`,
      params
    );

    // 3. Gastos por categoría
    const [gastosPorCategoria] = await pool.query(
      `SELECT categoria_gasto, COALESCE(SUM(monto), 0) AS total_bs, COUNT(*) AS cantidad
       FROM egresos_gastos
       ${branchFilterGastos ? branchFilterGastos + " AND tipo = 'egreso'" : "WHERE tipo = 'egreso'"}
       GROUP BY categoria_gasto
       ORDER BY total_bs DESC`,
      params
    );

    // 4. Lotes por vencer (próximos 45 días)
    const [lotesPorVencer] = await pool.query(
      `SELECT il.id, il.numero_lote, il.fecha_vencimiento, il.stock_actual_unidades,
              p.nombre AS producto_nombre, p.codigo_barras, s.nombre AS sucursal_nombre,
              DATEDIFF(il.fecha_vencimiento, CURDATE()) AS dias_restantes
       FROM inventario_lotes il
       JOIN productos p ON il.producto_id = p.id
       JOIN sucursales s ON il.sucursal_id = s.id
       ${branchFilterLotes ? branchFilterLotes + ' AND' : 'WHERE'} il.fecha_vencimiento IS NOT NULL 
       AND il.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 45 DAY)
       AND il.stock_actual_unidades > 0
       ORDER BY il.fecha_vencimiento ASC
       LIMIT 8`,
      params
    );

    // 5. Productos con stock bajo
    const [stockBajo] = await pool.query(
      `SELECT sp.producto_id, sp.sucursal_id, sp.stock_total_unidades, sp.stock_minimo_alerta,
              sp.precio_venta_normal, sp.en_oferta, sp.precio_venta_oferta,
              p.nombre AS producto_nombre, p.codigo_barras, c.nombre AS categoria_nombre,
              s.nombre AS sucursal_nombre
       FROM sucursal_productos sp
       JOIN productos p ON sp.producto_id = p.id
       JOIN categorias c ON p.categoria_id = c.id
       JOIN sucursales s ON sp.sucursal_id = s.id
       WHERE sp.stock_total_unidades <= sp.stock_minimo_alerta
       ${sucursalId ? 'AND sp.sucursal_id = ?' : ''}
       ORDER BY sp.stock_total_unidades ASC
       LIMIT 8`,
      sucursalId ? [sucursalId] : []
    );

    // 6. Arqueos de caja activos
    const [cajasActivas] = await pool.query(
      `SELECT a.id, a.sucursal_id, a.monto_apertura, a.fecha_apertura, a.total_ventas_efectivo,
              u.nombre AS cajero_nombre, s.nombre AS sucursal_nombre
       FROM arqueos_caja a
       JOIN usuarios u ON a.usuario_id = u.id
       JOIN sucursales s ON a.sucursal_id = s.id
       WHERE a.estado = 'abierta'
       ${sucursalId ? 'AND a.sucursal_id = ?' : ''}`,
      sucursalId ? [sucursalId] : []
    );

    // 7. Lista de sucursales con resumen de ventas
    const [resumenSucursales] = await pool.query(
      `SELECT s.id, s.nombre, s.codigo, s.ciudad, s.direccion, s.es_matriz,
              COUNT(DISTINCT v.id) AS ventas_hoy,
              COALESCE(SUM(v.monto_total), 0) AS total_hoy_bs
       FROM sucursales s
       LEFT JOIN ventas v ON s.id = v.sucursal_id AND DATE(v.fecha_venta) = CURDATE() AND v.estado = 'completada'
       WHERE s.estado = 'activo'
       GROUP BY s.id
       ORDER BY s.es_matriz DESC, s.nombre ASC`
    );

    return {
      ventasHoy: ventasHoy[0] || { total_transacciones: 0, total_bs: 0, total_efectivo_bs: 0, total_qr_bs: 0, total_tarjeta_bs: 0 },
      gastosMes: Number(gastosMes[0]?.total_gastos_bs || 0),
      gastosPorCategoria,
      lotesPorVencer,
      stockBajo,
      cajasActivas,
      resumenSucursales
    };
  }
}

module.exports = new SucursalService();
