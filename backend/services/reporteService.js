const { pool } = require('../config/db');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

class ReporteService {
  /**
   * Resuelve el rango de fechas a partir del filtro de periodo
   */
  resolveDateRange(periodo, fechaInicio, fechaFin) {
    const now = new Date();
    let inicio = '';
    let fin = '';

    const formatDate = (d) => d.toISOString().slice(0, 10);

    switch (periodo) {
      case 'diario': {
        const todayStr = formatDate(now);
        inicio = `${todayStr} 00:00:00`;
        fin = `${todayStr} 23:59:59`;
        break;
      }
      case 'semanal': {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        inicio = `${formatDate(weekAgo)} 00:00:00`;
        fin = `${formatDate(now)} 23:59:59`;
        break;
      }
      case 'mensual': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        inicio = `${formatDate(startOfMonth)} 00:00:00`;
        fin = `${formatDate(endOfMonth)} 23:59:59`;
        break;
      }
      case 'anual': {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const endOfYear = new Date(now.getFullYear(), 11, 31);
        inicio = `${formatDate(startOfYear)} 00:00:00`;
        fin = `${formatDate(endOfYear)} 23:59:59`;
        break;
      }
      case 'personalizado':
      default: {
        if (fechaInicio && fechaFin) {
          inicio = `${fechaInicio} 00:00:00`;
          fin = `${fechaFin} 23:59:59`;
        } else if (fechaInicio) {
          inicio = `${fechaInicio} 00:00:00`;
          fin = `${fechaInicio} 23:59:59`;
        } else {
          // Últimos 30 días por defecto
          const monthAgo = new Date();
          monthAgo.setDate(now.getDate() - 30);
          inicio = `${formatDate(monthAgo)} 00:00:00`;
          fin = `${formatDate(now)} 23:59:59`;
        }
        break;
      }
    }

    return { inicio, fin };
  }

  /**
   * Obtener datos consolidados o filtrados para la pantalla de reportes
   */
  async getReporteData(filtros = {}) {
    const {
      sucursal_id = null,
      periodo = 'mensual',
      fecha_inicio = null,
      fecha_fin = null,
      metodo_pago = 'todos'
    } = filtros;

    const { inicio, fin } = this.resolveDateRange(periodo, fecha_inicio, fecha_fin);

    const isConsolidado = !sucursal_id || sucursal_id === 'todas';
    const parsedSucursalId = isConsolidado ? null : parseInt(sucursal_id, 10);

    // Obtener información de la sucursal
    let sucursalNombre = 'Todas las Tiendas (Consolidado)';
    if (parsedSucursalId) {
      const [sRows] = await pool.query('SELECT nombre FROM sucursales WHERE id = ?', [parsedSucursalId]);
      if (sRows.length > 0) sucursalNombre = sRows[0].nombre;
    }

    // 1. Consulta de Ventas
    let sqlVentas = `
      SELECT 
        v.id, v.sucursal_id, s.nombre AS sucursal_nombre,
        v.usuario_id, u.nombre AS cajero_nombre,
        v.numero_comprobante, v.tipo_comprobante,
        v.cliente_nombre, v.cliente_nit_ci,
        v.metodo_pago, v.subtotal, v.descuento, v.monto_total,
        v.monto_recibido, v.cambio, v.fecha_venta
      FROM ventas v
      JOIN sucursales s ON v.sucursal_id = s.id
      JOIN usuarios u ON v.usuario_id = u.id
      WHERE v.estado = 'completada' AND v.fecha_venta BETWEEN ? AND ?
    `;
    const paramsVentas = [inicio, fin];

    if (parsedSucursalId) {
      sqlVentas += ` AND v.sucursal_id = ?`;
      paramsVentas.push(parsedSucursalId);
    }

    if (metodo_pago && metodo_pago !== 'todos') {
      sqlVentas += ` AND v.metodo_pago = ?`;
      paramsVentas.push(metodo_pago);
    }

    sqlVentas += ` ORDER BY v.fecha_venta DESC, v.id DESC`;
    const [ventas] = await pool.query(sqlVentas, paramsVentas);

    // 2. Consulta de Egresos
    let sqlEgresos = `
      SELECT 
        g.id, g.sucursal_id, s.nombre AS sucursal_nombre,
        g.usuario_id, u.nombre AS cajero_nombre,
        g.categoria_gasto, g.monto, g.comprobante_nro,
        g.concepto, g.beneficiario, g.metodo_pago, g.fecha_gasto
      FROM egresos_gastos g
      JOIN sucursales s ON g.sucursal_id = s.id
      JOIN usuarios u ON g.usuario_id = u.id
      WHERE g.tipo = 'egreso' AND g.fecha_gasto BETWEEN ? AND ?
    `;
    const paramsEgresos = [inicio, fin];

    if (parsedSucursalId) {
      sqlEgresos += ` AND g.sucursal_id = ?`;
      paramsEgresos.push(parsedSucursalId);
    }

    if (metodo_pago && metodo_pago !== 'todos') {
      if (metodo_pago === 'efectivo') {
        sqlEgresos += ` AND g.metodo_pago = 'efectivo'`;
      } else {
        sqlEgresos += ` AND g.metodo_pago != 'efectivo'`;
      }
    }

    sqlEgresos += ` ORDER BY g.fecha_gasto DESC, g.id DESC`;
    const [egresos] = await pool.query(sqlEgresos, paramsEgresos);

    // 3. Totales Cuadrados
    let totalIngresos = 0;
    let totalEfectivoVentas = 0;
    let totalQrVentas = 0;
    let totalTarjetaVentas = 0;

    for (const v of ventas) {
      const mt = parseFloat(v.monto_total) || 0;
      totalIngresos += mt;
      if (v.metodo_pago === 'efectivo') totalEfectivoVentas += mt;
      else if (v.metodo_pago === 'qr_simple') totalQrVentas += mt;
      else if (v.metodo_pago === 'tarjeta') totalTarjetaVentas += mt;
      else if (v.metodo_pago === 'mixto') {
        totalEfectivoVentas += mt * 0.5;
        totalQrVentas += mt * 0.5;
      }
    }

    let totalEgresos = 0;
    let totalEgresosCaja = 0;
    let totalEgresosTransferencia = 0;

    for (const g of egresos) {
      const mg = parseFloat(g.monto) || 0;
      totalEgresos += mg;
      if (g.metodo_pago === 'efectivo') totalEgresosCaja += mg;
      else totalEgresosTransferencia += mg;
    }

    totalIngresos = parseFloat(totalIngresos.toFixed(2));
    totalEgresos = parseFloat(totalEgresos.toFixed(2));
    const utilidadNeta = parseFloat((totalIngresos - totalEgresos).toFixed(2));
    const margenUtilidad = totalIngresos > 0 ? parseFloat(((utilidadNeta / totalIngresos) * 100).toFixed(1)) : 0;

    return {
      periodo: {
        tipo: periodo,
        fechaInicio: inicio.slice(0, 10),
        fechaFin: fin.slice(0, 10),
        sucursalId: parsedSucursalId,
        sucursalNombre,
        metodoPago: metodo_pago
      },
      totales: {
        totalIngresos,
        totalEfectivoVentas: parseFloat(totalEfectivoVentas.toFixed(2)),
        totalQrVentas: parseFloat(totalQrVentas.toFixed(2)),
        totalTarjetaVentas: parseFloat(totalTarjetaVentas.toFixed(2)),
        totalEgresos,
        totalEgresosCaja: parseFloat(totalEgresosCaja.toFixed(2)),
        totalEgresosTransferencia: parseFloat(totalEgresosTransferencia.toFixed(2)),
        utilidadNeta,
        margenUtilidad,
        cantidadVentas: ventas.length,
        cantidadEgresos: egresos.length
      },
      ventas,
      egresos
    };
  }

  /**
   * Generar reporte en formato Excel (.xlsx) con exceljs
   */
  async exportarExcel(filtros) {
    const data = await this.getReporteData(filtros);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Candy Boom Minimarket';
    workbook.created = new Date();

    const azulRey = '0052CC';
    const naranjaBoom = 'FF6B00';
    const grisFondo = 'F8FAFC';

    // -------------------------------------------------------------
    // HOJA 1: RESUMEN EJECUTIVO Y TOTALES CUADRADOS
    // -------------------------------------------------------------
    const sheetResumen = workbook.addWorksheet('Resumen Ejecutivo');
    sheetResumen.views = [{ showGridLines: true }];

    // Título Principal
    sheetResumen.mergeCells('A1:F1');
    const titleCell = sheetResumen.getCell('A1');
    titleCell.value = '🍭 CANDY BOOM - REPORTE GERENCIAL CONSOLIDADO';
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: azulRey } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheetResumen.getRow(1).height = 36;

    // Subtítulo / Metadata
    sheetResumen.mergeCells('A2:F2');
    const subCell = sheetResumen.getCell('A2');
    subCell.value = `Sucursal: ${data.periodo.sucursalNombre} | Período: ${data.periodo.fechaInicio} al ${data.periodo.fechaFin} | Moneda: Bolivianos (Bs.)`;
    subCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E293B' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheetResumen.getRow(2).height = 24;

    // Tarjetas KPI en fila 4
    sheetResumen.getCell('B4').value = 'VENTAS TOTALES (Bs.)';
    sheetResumen.getCell('B5').value = data.totales.totalIngresos;
    sheetResumen.getCell('C4').value = 'GASTOS TOTALES (Bs.)';
    sheetResumen.getCell('C5').value = data.totales.totalEgresos;
    sheetResumen.getCell('D4').value = 'UTILIDAD NETA (Bs.)';
    sheetResumen.getCell('D5').value = data.totales.utilidadNeta;
    sheetResumen.getCell('E4').value = 'MARGEN UTILIDAD';
    sheetResumen.getCell('E5').value = `${data.totales.margenUtilidad}%`;

    ['B', 'C', 'D', 'E'].forEach((col) => {
      const header = sheetResumen.getCell(`${col}4`);
      header.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF475569' } };
      header.alignment = { horizontal: 'center', vertical: 'middle' };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

      const value = sheetResumen.getCell(`${col}5`);
      value.font = { name: 'Calibri', size: 14, bold: true, color: { argb: col === 'D' ? (data.totales.utilidadNeta >= 0 ? 'FF059669' : 'FFDC2626') : 'FF0F172A' } };
      value.alignment = { horizontal: 'center', vertical: 'middle' };
      if (col !== 'E') value.numFmt = '"Bs. "#,##0.00';
    });
    sheetResumen.getRow(4).height = 20;
    sheetResumen.getRow(5).height = 28;

    // Tabla Cuadrada de Arqueo / Flujo
    sheetResumen.getCell('B7').value = 'CONCEPTO FINANCIERO';
    sheetResumen.getCell('C7').value = 'MONTO EN BOLIVIANOS (Bs.)';
    sheetResumen.getCell('D7').value = 'PARTICIPACIÓN (%)';
    ['B7', 'C7', 'D7'].forEach(c => {
      const cell = sheetResumen.getCell(c);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: azulRey } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const conceptos = [
      ['Ventas en Efectivo (Caja)', data.totales.totalEfectivoVentas, data.totales.totalIngresos > 0 ? (data.totales.totalEfectivoVentas / data.totales.totalIngresos * 100).toFixed(1) + '%' : '0%'],
      ['Ventas por QR Simple', data.totales.totalQrVentas, data.totales.totalIngresos > 0 ? (data.totales.totalQrVentas / data.totales.totalIngresos * 100).toFixed(1) + '%' : '0%'],
      ['Ventas con Tarjeta / Otros', data.totales.totalTarjetaVentas, data.totales.totalIngresos > 0 ? (data.totales.totalTarjetaVentas / data.totales.totalIngresos * 100).toFixed(1) + '%' : '0%'],
      ['TOTAL INGRESOS (A)', data.totales.totalIngresos, '100%'],
      ['Gastos de Caja Física (Efectivo)', data.totales.totalEgresosCaja, data.totales.totalEgresos > 0 ? (data.totales.totalEgresosCaja / data.totales.totalEgresos * 100).toFixed(1) + '%' : '0%'],
      ['Gastos por Transferencia / QR', data.totales.totalEgresosTransferencia, data.totales.totalEgresos > 0 ? (data.totales.totalEgresosTransferencia / data.totales.totalEgresos * 100).toFixed(1) + '%' : '0%'],
      ['TOTAL EGRESOS (B)', data.totales.totalEgresos, '100%'],
      ['UTILIDAD NETA (A - B)', data.totales.utilidadNeta, data.totales.totalIngresos > 0 ? (data.totales.utilidadNeta / data.totales.totalIngresos * 100).toFixed(1) + '%' : '0%']
    ];

    let rIdx = 8;
    for (const [concepto, monto, pct] of conceptos) {
      const row = sheetResumen.getRow(rIdx);
      const isTotalRow = concepto.startsWith('TOTAL') || concepto.startsWith('UTILIDAD');

      row.getCell(2).value = concepto;
      row.getCell(3).value = monto;
      row.getCell(3).numFmt = '"Bs. "#,##0.00';
      row.getCell(4).value = pct;
      row.getCell(4).alignment = { horizontal: 'center' };

      if (isTotalRow) {
        row.font = { bold: true };
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      }
      rIdx++;
    }

    sheetResumen.getColumn(1).width = 4;
    sheetResumen.getColumn(2).width = 38;
    sheetResumen.getColumn(3).width = 24;
    sheetResumen.getColumn(4).width = 20;
    sheetResumen.getColumn(5).width = 18;
    sheetResumen.getColumn(6).width = 4;

    // -------------------------------------------------------------
    // HOJA 2: DETALLE DE VENTAS
    // -------------------------------------------------------------
    const sheetVentas = workbook.addWorksheet('Detalle de Ventas');
    sheetVentas.views = [{ showGridLines: true }];

    sheetVentas.columns = [
      { header: 'N° Comprobante', key: 'numero_comprobante', width: 18 },
      { header: 'Fecha y Hora', key: 'fecha_venta', width: 20 },
      { header: 'Sucursal', key: 'sucursal_nombre', width: 22 },
      { header: 'Cajero / Usuario', key: 'cajero_nombre', width: 20 },
      { header: 'Cliente', key: 'cliente_nombre', width: 26 },
      { header: 'NIT / CI', key: 'cliente_nit_ci', width: 14 },
      { header: 'Método Pago', key: 'metodo_pago', width: 16 },
      { header: 'Subtotal (Bs.)', key: 'subtotal', width: 16 },
      { header: 'Descuento (Bs.)', key: 'descuento', width: 16 },
      { header: 'Total Venta (Bs.)', key: 'monto_total', width: 18 }
    ];

    // Estilo encabezado
    sheetVentas.getRow(1).height = 26;
    sheetVentas.getRow(1).eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: azulRey } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    data.ventas.forEach((v) => {
      const row = sheetVentas.addRow({
        numero_comprobante: v.numero_comprobante,
        fecha_venta: new Date(v.fecha_venta).toLocaleString('es-BO'),
        sucursal_nombre: v.sucursal_nombre,
        cajero_nombre: v.cajero_nombre,
        cliente_nombre: v.cliente_nombre,
        cliente_nit_ci: v.cliente_nit_ci,
        metodo_pago: v.metodo_pago.toUpperCase(),
        subtotal: parseFloat(v.subtotal) || 0,
        descuento: parseFloat(v.descuento) || 0,
        monto_total: parseFloat(v.monto_total) || 0
      });

      row.getCell('subtotal').numFmt = '"Bs. "#,##0.00';
      row.getCell('descuento').numFmt = '"Bs. "#,##0.00';
      row.getCell('monto_total').numFmt = '"Bs. "#,##0.00';
      row.getCell('monto_total').font = { bold: true };
    });

    // Fila total de ventas
    const totalVentasRow = sheetVentas.addRow({
      numero_comprobante: 'TOTAL GENERAL',
      monto_total: data.totales.totalIngresos
    });
    totalVentasRow.font = { bold: true, size: 11 };
    totalVentasRow.getCell('monto_total').numFmt = '"Bs. "#,##0.00';
    totalVentasRow.getCell('monto_total').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    // -------------------------------------------------------------
    // HOJA 3: DETALLE DE EGRESOS Y GASTOS
    // -------------------------------------------------------------
    const sheetEgresos = workbook.addWorksheet('Detalle de Egresos');
    sheetEgresos.views = [{ showGridLines: true }];

    sheetEgresos.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Fecha y Hora', key: 'fecha_gasto', width: 20 },
      { header: 'Sucursal', key: 'sucursal_nombre', width: 22 },
      { header: 'Cajero / Solicitante', key: 'cajero_nombre', width: 20 },
      { header: 'Categoría de Gasto', key: 'categoria_gasto', width: 22 },
      { header: 'Concepto / Motivo', key: 'concepto', width: 30 },
      { header: 'Beneficiario', key: 'beneficiario', width: 22 },
      { header: 'Comprobante', key: 'comprobante_nro', width: 16 },
      { header: 'Origen del Dinero', key: 'metodo_pago', width: 20 },
      { header: 'Monto Egreso (Bs.)', key: 'monto', width: 18 }
    ];

    sheetEgresos.getRow(1).height = 26;
    sheetEgresos.getRow(1).eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: naranjaBoom } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    data.egresos.forEach((g) => {
      const row = sheetEgresos.addRow({
        id: g.id,
        fecha_gasto: new Date(g.fecha_gasto).toLocaleString('es-BO'),
        sucursal_nombre: g.sucursal_nombre,
        cajero_nombre: g.cajero_nombre,
        categoria_gasto: g.categoria_gasto,
        concepto: g.concepto,
        beneficiario: g.beneficiario || 'S/N',
        comprobante_nro: g.comprobante_nro || 'S/C',
        metodo_pago: g.metodo_pago === 'efectivo' ? 'CAJA FÍSICA' : 'TRANSFERENCIA / QR',
        monto: parseFloat(g.monto) || 0
      });

      row.getCell('monto').numFmt = '"Bs. "#,##0.00';
      row.getCell('monto').font = { bold: true };
    });

    const totalEgresosRow = sheetEgresos.addRow({
      categoria_gasto: 'TOTAL EGRESOS',
      monto: data.totales.totalEgresos
    });
    totalEgresosRow.font = { bold: true, size: 11 };
    totalEgresosRow.getCell('monto').numFmt = '"Bs. "#,##0.00';
    totalEgresosRow.getCell('monto').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    return workbook;
  }

  /**
   * Generar reporte en formato PDF formal con pdfkit
   */
  async generarPDF(filtros, res) {
    const data = await this.getReporteData(filtros);

    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 40,
      info: {
        Title: 'Candy Boom - Reporte Financiero Gerencial',
        Author: 'Candy Boom Minimarket'
      }
    });

    // Pipe response stream
    doc.pipe(res);

    const azulRey = '#0052CC';
    const naranjaBoom = '#FF6B00';
    const grisOscuro = '#1E293B';
    const grisClaro = '#64748B';

    // 1. Encabezado con Branding
    doc.rect(40, 40, 532, 60).fill(azulRey);

    doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold')
       .text('CANDY BOOM - MINIMARKET MULTI-SUCURSAL', 55, 52);

    doc.fontSize(10).font('Helvetica')
       .text('Informe Gerencial y Estado de Resultados Cuadrado (La Paz, Bolivia)', 55, 75);

    // 2. Metadatos del Informe
    doc.moveDown(2);
    const metaY = 115;
    doc.fillColor(grisOscuro).fontSize(10).font('Helvetica-Bold')
       .text('Sucursal:', 40, metaY)
       .font('Helvetica').text(data.periodo.sucursalNombre, 100, metaY)
       .font('Helvetica-Bold').text('Período:', 340, metaY)
       .font('Helvetica').text(`${data.periodo.fechaInicio} al ${data.periodo.fechaFin}`, 400, metaY);

    doc.font('Helvetica-Bold').text('Moneda:', 40, metaY + 16)
       .font('Helvetica').text('Bolivianos (Bs.)', 100, metaY + 16)
       .font('Helvetica-Bold').text('Generado:', 340, metaY + 16)
       .font('Helvetica').text(new Date().toLocaleString('es-BO'), 400, metaY + 16);

    // Línea divisoria
    doc.moveTo(40, metaY + 36).lineTo(572, metaY + 36).strokeColor('#E2E8F0').lineWidth(1).stroke();

    // 3. Tarjetas Resumen Financiero Cuadrado
    const kpiY = 165;
    const boxWidth = 125;
    const boxHeight = 55;

    // Caja 1: Ventas Totales
    doc.roundedRect(40, kpiY, boxWidth, boxHeight, 6).fillAndStroke('#F1F5F9', '#CBD5E1');
    doc.fillColor(grisClaro).fontSize(8).font('Helvetica-Bold').text('TOTAL VENTAS (INGRESOS)', 48, kpiY + 8);
    doc.fillColor(azulRey).fontSize(14).font('Helvetica-Bold').text(`Bs. ${data.totales.totalIngresos.toFixed(2)}`, 48, kpiY + 24);
    doc.fillColor(grisClaro).fontSize(8).font('Helvetica').text(`${data.totales.cantidadVentas} transacciones`, 48, kpiY + 42);

    // Caja 2: Gastos Totales
    doc.roundedRect(175, kpiY, boxWidth, boxHeight, 6).fillAndStroke('#F1F5F9', '#CBD5E1');
    doc.fillColor(grisClaro).fontSize(8).font('Helvetica-Bold').text('TOTAL GASTOS (EGRESOS)', 183, kpiY + 8);
    doc.fillColor(naranjaBoom).fontSize(14).font('Helvetica-Bold').text(`Bs. ${data.totales.totalEgresos.toFixed(2)}`, 183, kpiY + 24);
    doc.fillColor(grisClaro).fontSize(8).font('Helvetica').text(`${data.totales.cantidadEgresos} registros`, 183, kpiY + 42);

    // Caja 3: Utilidad Neta
    const colorUtilidad = data.totales.utilidadNeta >= 0 ? '#059669' : '#DC2626';
    doc.roundedRect(310, kpiY, boxWidth, boxHeight, 6).fillAndStroke('#F1F5F9', '#CBD5E1');
    doc.fillColor(grisClaro).fontSize(8).font('Helvetica-Bold').text('UTILIDAD NETA FINAL', 318, kpiY + 8);
    doc.fillColor(colorUtilidad).fontSize(14).font('Helvetica-Bold').text(`Bs. ${data.totales.utilidadNeta.toFixed(2)}`, 318, kpiY + 24);
    doc.fillColor(grisClaro).fontSize(8).font('Helvetica').text(`Margen: ${data.totales.margenUtilidad}%`, 318, kpiY + 42);

    // Caja 4: Efectivo Físico Caja
    doc.roundedRect(445, kpiY, boxWidth, boxHeight, 6).fillAndStroke('#F1F5F9', '#CBD5E1');
    doc.fillColor(grisClaro).fontSize(8).font('Helvetica-Bold').text('EFECTIVO NETO CAJA', 453, kpiY + 8);
    const efNetoCaja = (data.totales.totalEfectivoVentas - data.totales.totalEgresosCaja).toFixed(2);
    doc.fillColor(grisOscuro).fontSize(14).font('Helvetica-Bold').text(`Bs. ${efNetoCaja}`, 453, kpiY + 24);
    doc.fillColor(grisClaro).fontSize(8).font('Helvetica').text('Ingreso - Gasto Caja', 453, kpiY + 42);

    // 4. Tabla de Flujo Cuadrado
    let curY = 240;
    doc.fillColor(azulRey).fontSize(11).font('Helvetica-Bold').text('1. CUADRE DE INGRESOS Y EGRESOS', 40, curY);

    curY += 16;
    doc.rect(40, curY, 532, 20).fill('#0052CC');
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
       .text('CONCEPTO FINANCIERO', 50, curY + 6)
       .text('TIPO', 330, curY + 6)
       .text('MONTO (Bs.)', 480, curY + 6, { align: 'right', width: 80 });

    const tablaItems = [
      ['Ventas en Efectivo (Caja)', 'Ingreso', `Bs. ${data.totales.totalEfectivoVentas.toFixed(2)}`],
      ['Ventas por QR Simple', 'Ingreso', `Bs. ${data.totales.totalQrVentas.toFixed(2)}`],
      ['Ventas con Tarjeta / Otros', 'Ingreso', `Bs. ${data.totales.totalTarjetaVentas.toFixed(2)}`],
      ['TOTAL INGRESOS', 'SUBTOTAL', `Bs. ${data.totales.totalIngresos.toFixed(2)}`],
      ['Gastos Pagados con Efectivo de Caja', 'Egreso', `Bs. ${data.totales.totalEgresosCaja.toFixed(2)}`],
      ['Gastos Pagados por Transferencia / QR', 'Egreso', `Bs. ${data.totales.totalEgresosTransferencia.toFixed(2)}`],
      ['TOTAL EGRESOS OPERATIVOS', 'SUBTOTAL', `Bs. ${data.totales.totalEgresos.toFixed(2)}`],
      ['UTILIDAD NETA TOTAL', 'BALANCE', `Bs. ${data.totales.utilidadNeta.toFixed(2)}`]
    ];

    curY += 20;
    tablaItems.forEach(([conc, tipo, mto], idx) => {
      const isSub = tipo === 'SUBTOTAL' || tipo === 'BALANCE';
      if (idx % 2 === 1 && !isSub) {
        doc.rect(40, curY, 532, 18).fill('#F8FAFC');
      } else if (isSub) {
        doc.rect(40, curY, 532, 18).fill('#E2E8F0');
      }

      doc.fillColor(isSub ? '#0F172A' : '#334155')
         .fontSize(8.5)
         .font(isSub ? 'Helvetica-Bold' : 'Helvetica')
         .text(conc, 50, curY + 5)
         .text(tipo, 330, curY + 5)
         .text(mto, 480, curY + 5, { align: 'right', width: 80 });

      curY += 18;
    });

    // 5. Muestra de Transacciones Recientes
    curY += 20;
    doc.fillColor(azulRey).fontSize(11).font('Helvetica-Bold').text('2. ÚLTIMAS VENTAS REGISTRADAS EN EL PERÍODO', 40, curY);

    curY += 16;
    doc.rect(40, curY, 532, 18).fill('#475569');
    doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold')
       .text('COMPROBANTE', 45, curY + 5)
       .text('FECHA', 135, curY + 5)
       .text('CLIENTE', 215, curY + 5)
       .text('MÉTODO', 370, curY + 5)
       .text('TOTAL (Bs.)', 480, curY + 5, { align: 'right', width: 80 });

    curY += 18;
    const ultimasVentas = data.ventas.slice(0, 8);
    if (ultimasVentas.length === 0) {
      doc.fillColor(grisClaro).fontSize(8).font('Helvetica').text('No se registraron ventas en este período.', 50, curY + 6);
      curY += 20;
    } else {
      ultimasVentas.forEach((v, idx) => {
        if (idx % 2 === 1) doc.rect(40, curY, 532, 16).fill('#F8FAFC');
        doc.fillColor('#334155').fontSize(7.5).font('Helvetica')
           .text(v.numero_comprobante, 45, curY + 4)
           .text(new Date(v.fecha_venta).toLocaleDateString('es-BO'), 135, curY + 4)
           .text((v.cliente_nombre || 'Consumidor Final').slice(0, 24), 215, curY + 4)
           .text(v.metodo_pago.toUpperCase(), 370, curY + 4)
           .font('Helvetica-Bold')
           .text(`Bs. ${(parseFloat(v.monto_total) || 0).toFixed(2)}`, 480, curY + 4, { align: 'right', width: 80 });
        curY += 16;
      });
    }

    // 6. Pie de Página con Firmas
    const footerY = 670;
    doc.moveTo(70, footerY).lineTo(230, footerY).strokeColor('#94A3B8').lineWidth(1).stroke();
    doc.fillColor(grisClaro).fontSize(8).font('Helvetica')
       .text('Firma Responsable / Gerencia', 70, footerY + 6, { width: 160, align: 'center' });

    doc.moveTo(380, footerY).lineTo(540, footerY).strokeColor('#94A3B8').lineWidth(1).stroke();
    doc.fillColor(grisClaro).fontSize(8).font('Helvetica')
       .text('Firma Encargado de Caja', 380, footerY + 6, { width: 160, align: 'center' });

    doc.fontSize(7).text('Candy Boom POS - Documento Oficial de Auditoría Interna | Bolivia', 40, 725, { align: 'center', width: 532 });

    doc.end();
  }
}

module.exports = new ReporteService();
