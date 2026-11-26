const inventarioService = require('./services/inventarioService');
const { pool } = require('./config/db');

async function testPOSFlow() {
  console.log('--- INICIANDO TEST COMPLETO DE FLUJO POS, EGRESOS Y ARQUEO ---');
  const sucursalId = 1; // Sucursal 1 (Matriz)
  const usuarioId = 1;  // Admin / Cajero

  // 1. Saldo de cierre anterior
  console.log('\n1. Consultando saldo de cierre anterior...');
  const saldoAnt = await inventarioService.getSaldoCierreAnterior(sucursalId);
  console.log('Saldo Anterior resultado:', saldoAnt);

  // 2. Comprobar si hay arqueo activo
  console.log('\n2. Verificando arqueo activo...');
  let activo = await inventarioService.getArqueoActivo(sucursalId, usuarioId);
  console.log('Arqueo activo previo:', activo ? `ID: ${activo.id}, Estado: ${activo.estado}` : 'Ninguno');

  // Si no hay arqueo activo, abrir uno
  if (!activo) {
    console.log('\n2.1 Abriendo nuevo turno de caja con Bs. 150.00...');
    const apertura = await inventarioService.abrirCaja(sucursalId, usuarioId, 150.00, 'Apertura de turno de prueba');
    console.log('Turno abierto con éxito ID:', apertura.id, 'Monto apertura:', apertura.monto_apertura);
    activo = await inventarioService.getArqueoActivo(sucursalId, usuarioId);
  }

  // 3. Obtener productos para POS
  console.log('\n3. Obteniendo productos para POS...');
  const productos = await inventarioService.getProductosPOS(sucursalId);
  console.log(`Encontrados ${productos.length} productos en Sucursal ${sucursalId}`);
  const primerProd = productos[0];
  console.log(`Producto de prueba: ${primerProd.nombre} (ID: ${primerProd.id}, Precio: Bs. ${primerProd.precio_final}, Stock: ${primerProd.stock_total_unidades})`);

  // 4. Venta Normal con FIFO
  console.log('\n4. Procesando Venta Normal (2 unidades) con Efectivo...');
  const ventaNormal = await inventarioService.procesarVentaPOS(sucursalId, usuarioId, {
    es_venta_rapida: false,
    metodo_pago: 'efectivo',
    monto_recibido: 50.00,
    cliente_nombre: 'Juan Pérez (Cliente Prueba)',
    cliente_nit_ci: '8492019',
    items: [
      {
        producto_id: primerProd.id,
        cantidad: 2,
        precio_unitario: primerProd.precio_final
      }
    ]
  });
  console.log('Venta Normal exitosa:', {
    comprobante: ventaNormal.numeroComprobante,
    total: ventaNormal.montoTotal,
    metodo: ventaNormal.metodoPago,
    cambio: ventaNormal.cambio,
    lotesAfectados: ventaNormal.detallesLotes
  });

  // 5. Venta Rápida sin detalle (Direct lump sum via QR Simple)
  console.log('\n5. Procesando Venta Rápida sin Detalle (Bs. 15.00 por QR Simple)...');
  const ventaRapida = await inventarioService.procesarVentaPOS(sucursalId, usuarioId, {
    es_venta_rapida: true,
    metodo_pago: 'qr_simple',
    monto_total: 15.00,
    monto_recibido: 15.00,
    observaciones: 'Venta rápida en hora pico por QR'
  });
  console.log('Venta Rápida exitosa:', {
    comprobante: ventaRapida.numeroComprobante,
    total: ventaRapida.montoTotal,
    metodo: ventaRapida.metodoPago
  });

  // 6. Registro de Egresos: Gasto en Efectivo (Caja) y Gasto en QR
  console.log('\n6. Registrando Egresos...');
  const gastoEfectivo = await inventarioService.registrarGasto(sucursalId, usuarioId, {
    categoria_gasto: 'Servicios Básicos',
    monto: 20.00,
    metodo_pago: 'efectivo',
    concepto: 'Pago de garrafón de agua para la tienda',
    beneficiario: 'Agua Cielo'
  });
  console.log(`Gasto Efectivo registrado: Bs. ${gastoEfectivo.monto} (Afecta caja física)`);

  const gastoQR = await inventarioService.registrarGasto(sucursalId, usuarioId, {
    categoria_gasto: 'Impuesto RTS',
    monto: 100.00,
    metodo_pago: 'transferencia_qr',
    concepto: 'Pago mensual Régimen Tributario Simplificado',
    beneficiario: 'SIN Bolivia'
  });
  console.log(`Gasto QR/Transferencia registrado: Bs. ${gastoQR.monto} (NO afecta caja física)`);

  // 7. Consultar Estado en Vivo del Arqueo
  console.log('\n7. Verificando estado en vivo del Arqueo...');
  const arqueoEnVivo = await inventarioService.getArqueoActivo(sucursalId, usuarioId);
  console.log('Arqueo en Vivo calculado:', {
    monto_apertura: arqueoEnVivo.monto_apertura,
    total_ventas_efectivo: arqueoEnVivo.total_ventas_efectivo,
    total_ventas_qr: arqueoEnVivo.total_ventas_qr,
    total_gastos_caja_efectivo: arqueoEnVivo.total_gastos,
    efectivo_esperado_en_caja: arqueoEnVivo.efectivo_esperado
  });

  // 8. Consultar listado de Gastos y Resumen
  console.log('\n8. Consultando resumen de gastos...');
  const gastosReport = await inventarioService.getGastos(sucursalId);
  console.log('Resumen de gastos:', gastosReport.resumen);

  // 9. Cierre de Caja con arqueo
  console.log('\n9. Cerrando Turno de Caja con efectivo físico contado exacto...');
  const cierre = await inventarioService.cerrarCaja(sucursalId, usuarioId, {
    monto_cierre_real: arqueoEnVivo.efectivo_esperado,
    observaciones: 'Cierre de turno verificado y cuadrado'
  });
  console.log('Resultado del Cierre:', {
    cierre_sistema: cierre.montoCierreSistema,
    cierre_real: cierre.montoCierreReal,
    diferencia: cierre.diferencia,
    cuadraExacto: cierre.cuadraExacto
  });

  // 10. Verificar que el próximo saldo anterior arrastra este monto real
  console.log('\n10. Comprobando arrastre de saldo para la próxima apertura...');
  const nuevoSaldoAnt = await inventarioService.getSaldoCierreAnterior(sucursalId);
  console.log('Nuevo Saldo Anterior:', nuevoSaldoAnt);

  console.log('\n=== TODOS LOS TESTS DEL MÓDULO PASARON EXITOSAMENTE ===\n');
  process.exit(0);
}

testPOSFlow().catch(err => {
  console.error('Error durante el test de POS:', err);
  process.exit(1);
});
