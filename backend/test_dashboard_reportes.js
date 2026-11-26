const dashboardService = require('./services/dashboardService');
const reporteService = require('./services/reporteService');
const fs = require('fs');
const path = require('path');

async function testDashboardAndReportes() {
  console.log('--- INICIANDO TEST DE DASHBOARD GERENCIAL Y REPORTES EXPORTABLES ---');

  // 1. Dashboard Consolidado
  console.log('\n1. Probando Dashboard Consolidado (Todas las Tiendas)...');
  const dashConsolidado = await dashboardService.getDashboardData('todas');
  console.log('Tienda:', dashConsolidado.sucursal.nombre);
  console.log('KPIs:', dashConsolidado.kpis);
  console.log('Puntos de venta por día:', dashConsolidado.ventasPorDia.length);
  console.log('Métodos de pago:', dashConsolidado.distribucionPagos);
  console.log('Top Productos:', dashConsolidado.topProductos.map(p => `${p.nombre} (${p.unidades_vendidas} u.)`));
  console.log('Alertas Vencimiento:', dashConsolidado.alertas.proximosVencer.length);
  console.log('Alertas Stock Bajo:', dashConsolidado.alertas.stockBajo.length);

  // 2. Dashboard Sucursal 1
  console.log('\n2. Probando Dashboard Filtrado por Sucursal 1...');
  const dashSucursal1 = await dashboardService.getDashboardData(1);
  console.log('Tienda:', dashSucursal1.sucursal.nombre);
  console.log('Ventas Totales Sucursal 1: Bs.', dashSucursal1.kpis.ventasTotales);

  // 3. Consulta de Reporte Datos
  console.log('\n3. Probando Consulta de Datos de Reporte (Mensual)...');
  const repData = await reporteService.getReporteData({ periodo: 'mensual' });
  console.log('Totales Cuadrados del Reporte:', repData.totales);
  console.log('Total Ventas listadas:', repData.ventas.length);
  console.log('Total Egresos listados:', repData.egresos.length);

  // 4. Generación de Excel
  console.log('\n4. Probando Generación de Excel con exceljs...');
  const wb = await reporteService.exportarExcel({ periodo: 'mensual' });
  const excelPath = path.join(__dirname, 'test_reporte.xlsx');
  await wb.xlsx.writeFile(excelPath);
  const statsExcel = fs.statSync(excelPath);
  console.log(`Excel generado con éxito! Tamaño: ${statsExcel.size} bytes (${(statsExcel.size / 1024).toFixed(1)} KB)`);
  fs.unlinkSync(excelPath);

  // 5. Generación de PDF
  console.log('\n5. Probando Generación de PDF con pdfkit...');
  const pdfPath = path.join(__dirname, 'test_reporte.pdf');
  const outPdf = fs.createWriteStream(pdfPath);
  await new Promise((resolve, reject) => {
    outPdf.on('finish', resolve);
    outPdf.on('error', reject);
    reporteService.generarPDF({ periodo: 'mensual' }, outPdf).catch(reject);
  });
  const statsPdf = fs.statSync(pdfPath);
  console.log(`PDF generado con éxito! Tamaño: ${statsPdf.size} bytes (${(statsPdf.size / 1024).toFixed(1)} KB)`);
  fs.unlinkSync(pdfPath);

  console.log('\n=== TODOS LOS TESTS DE DASHBOARD Y REPORTES PASARON EXITOSAMENTE ===\n');
  process.exit(0);
}

testDashboardAndReportes().catch(err => {
  console.error('Error en test:', err);
  process.exit(1);
});
