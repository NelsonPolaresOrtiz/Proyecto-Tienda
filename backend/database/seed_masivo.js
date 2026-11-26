const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Fecha de referencia actual del sistema: 26 de noviembre de 2026
const TODAY_STR = '2026-11-26';
const TODAY_BASE = new Date('2026-11-26T12:00:00');

function addDays(baseDate, days) {
  const d = new Date(baseDate.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fmtDateTime(d, hh = 10, mi = 0, ss = 0) {
  return `${fmtDate(d)} ${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Generador pseudoaleatorio determinístico para datos consistentes
let seedVal = 20261126;
function rand() {
  seedVal = (seedVal * 1664525 + 1013904223) % 4294967296;
  return seedVal / 4294967296;
}
function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

async function seedMasivo() {
  const tStart = Date.now();
  console.log('====================================================================');
  console.log('Candy Boom - Seed Masivo de Base de Datos (Sucre, Bolivia)');
  console.log('====================================================================');

  const connection = await pool.getConnection();

  try {
    // 1. Limpieza segura en orden hijo -> padre (compatible con TiDB Cloud y MySQL sin TRUNCATE DDL)
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    const tablasLimpiar = [
      'configuracion_alertas',
      'auditoria_actividades',
      'ajustes_stock',
      'traspasos_sucursales',
      'egresos_gastos',
      'venta_detalles',
      'ventas',
      'arqueos_caja',
      'inventario_lotes',
      'sucursal_productos',
      'productos',
      'categorias',
      'usuarios',
      'sucursales'
    ];
    for (const tabla of tablasLimpiar) {
      await connection.query(`DELETE FROM \`${tabla}\``);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    await connection.beginTransaction();

    // 2. Sucursales (2)
    const sucursales = [
      [1, 'Candy Boom - Casa Matriz', 'SUC-01', 'Sucre', 'Calle Nicolás Ortiz #45 (Zona Central), Sucre', '4-6451234', 1, 'activo'],
      [2, 'Candy Boom - Sucursal 2', 'SUC-02', 'Sucre', 'Av. Hernando Siles #820, Sucre', '4-6467890', 0, 'activo']
    ];
    await connection.query(
      'INSERT INTO sucursales (id, nombre, codigo, ciudad, direccion, telefono, es_matriz, estado) VALUES ?',
      [sucursales]
    );

    // 3. Usuarios (6): 1 Admin + 5 Cajeros (todos con contraseña 123456)
    const passwordHash = await bcrypt.hash('123456', 10);
    const usuarios = [
      [1, 'Carlos Eduardo Mendoza', 'admin@candyboom.bo', passwordHash, 'admin', null, '5648210 CH', '+59170612345', 'activo', `${TODAY_STR} 07:45:00`],
      [2, 'Ana Lucía Flores Mamani', 'vendedor1@candyboom.bo', passwordHash, 'vendedor', 1, '7482910 CH', '+59171234561', 'activo', `${TODAY_STR} 08:00:00`],
      [3, 'Diego Alejandro Quispe', 'vendedor2@candyboom.bo', passwordHash, 'vendedor', 2, '8129405 CH', '+59172345672', 'activo', `${TODAY_STR} 08:05:00`],
      [4, 'Valeria Choque Condori', 'cajero3@candyboom.bo', passwordHash, 'vendedor', 1, '7654321 CH', '+59173456783', 'activo', '2026-11-25 14:10:00'],
      [5, 'Rodrigo Vargas Tarifa', 'cajero4@candyboom.bo', passwordHash, 'vendedor', 2, '8541209 CH', '+59174567894', 'activo', '2026-11-25 14:05:00'],
      [6, 'Paola Andrea Serrudo', 'cajero5@candyboom.bo', passwordHash, 'vendedor', 1, '7912044 CH', '+59175678905', 'activo', '2026-11-24 08:15:00']
    ];
    await connection.query(
      'INSERT INTO usuarios (id, nombre, email, password, rol, sucursal_id, ci, telefono, estado, ultimo_login) VALUES ?',
      [usuarios]
    );

    // 4. Categorías (10)
    const categorias = [
      [1, 'Bebidas y Gaseosas', 'Gaseosas, refrescos y jugos en envase personal y familiar', 'cup-soda', '#0F172A', 'activo'],
      [2, 'Chocolates', 'Barras, bombones y tabletas de chocolate nacional e importado', 'candy', '#F97316', 'activo'],
      [3, 'Gomitas y Caramelos', 'Gomitas masticables, caramelos duros y chupetes', 'sparkles', '#F59E0B', 'activo'],
      [4, 'Galletas', 'Galletas dulces, rellenas, obleas y surtidos', 'cookie', '#D97706', 'activo'],
      [5, 'Snacks Salados', 'Papas fritas, chizitos, nachos, maní y pipocas', 'package', '#EA580C', 'activo'],
      [6, 'Lácteos', 'Leches saborizadas, yogures y bebidas lácteas UHT', 'milk', '#10B981', 'activo'],
      [7, 'Chicles y Mentas', 'Gomas de mascar y pastillas refrescantes', 'smile', '#059669', 'activo'],
      [8, 'Aguas y Energizantes', 'Aguas minerales purificadas, rehidratantes y energizantes', 'droplet', '#0F172A', 'activo'],
      [9, 'Helados y Postres', 'Paletas, conos, vasitos y postres fríos', 'snowflake', '#DC2626', 'activo'],
      [10, 'Canasta y Desayuno', 'Café, té, cereales, avena y untables', 'shopping-basket', '#475569', 'activo']
    ];
    await connection.query(
      'INSERT INTO categorias (id, nombre, descripcion, icono, color, estado) VALUES ?',
      [categorias]
    );

    // 5. Catálogo de Productos (60 productos con código 777... y precios reales en Bs.)
    const catalogoDef = [
      // Bebidas (cat 1)
      ['Coca-Cola Original 500ml', 1, 'Botella', 12, 48.00, 6.00],
      ['Coca-Cola Sin Azúcar 500ml', 1, 'Botella', 12, 48.00, 6.00],
      ['Fanta Naranja 500ml', 1, 'Botella', 12, 46.00, 6.00],
      ['Sprite Lima-Limón 500ml', 1, 'Botella', 12, 46.00, 6.00],
      ['Fanta Papaya Boliviana 500ml', 1, 'Botella', 12, 46.00, 6.00],
      ['Jugo del Valle Durazno 250ml', 1, 'Botella', 24, 54.00, 3.50],
      ['Cascada Frutilla 600ml', 1, 'Botella', 12, 36.00, 4.50],
      ['Cascada Guaraná 600ml', 1, 'Botella', 12, 36.00, 4.50],
      // Chocolates (cat 2)
      ['Chocolate Sublime Clásico 30g', 2, 'Unidad', 24, 72.00, 5.00],
      ['Bombón Para Ti Surtido Sucre 150g', 2, 'Paquete', 12, 180.00, 22.00],
      ['Tableta Para Ti Leche 50g', 2, 'Barra', 24, 156.00, 10.00],
      ['Chocolate Bon o Bon Clásico', 2, 'Unidad', 30, 54.00, 2.50],
      ['Chocolate Cofler Block 38g', 2, 'Barra', 24, 108.00, 7.00],
      ['Chocolate Milka Oreo 45g', 2, 'Barra', 24, 144.00, 9.00],
      ['Chocolate Toblerone Mini 35g', 2, 'Barra', 24, 192.00, 12.00],
      ['Chocolate Trencito Nestlé 24g', 2, 'Barra', 24, 72.00, 4.50],
      // Gomitas y Caramelos (cat 3)
      ['Gomitas Mogul Ositos 50g', 3, 'Paquete', 46, 92.00, 3.50],
      ['Gomitas Mogul Dientes Ácidos 50g', 3, 'Paquete', 46, 92.00, 3.50],
      ['Gomitas Ambrosía Frutales 45g', 3, 'Paquete', 24, 48.00, 3.00],
      ['Chupete Pico Dulce Unidad', 3, 'Unidad', 48, 36.00, 1.50],
      ['Caramelos Butter Toffees Bolsa 100g', 3, 'Bolsa', 24, 120.00, 8.00],
      ['Chupete Pop Bum Surtido', 3, 'Unidad', 100, 60.00, 1.00],
      // Galletas (cat 4)
      ['Galletas Oreo Clásica 36g', 4, 'Paquete', 24, 60.00, 4.00],
      ['Galletas Oreo Chocolate 36g', 4, 'Paquete', 24, 60.00, 4.00],
      ['Galletas Mabí Fagal Vainilla 120g', 4, 'Paquete', 24, 84.00, 5.50],
      ['Galletas Salvado Integral Fagal', 4, 'Paquete', 24, 72.00, 4.50],
      ['Obleas Opera Arcor 55g', 4, 'Paquete', 24, 60.00, 4.00],
      ['Galletas Club Social Original 26g', 4, 'Paquete', 24, 48.00, 3.00],
      ['Galletas Ritz Saladas 34g', 4, 'Paquete', 24, 54.00, 3.50],
      // Snacks Salados (cat 5)
      ['Papas Fritas Lays Clásicas 40g', 5, 'Paquete', 12, 42.00, 5.00],
      ['Papas Fritas Lays Queso 40g', 5, 'Paquete', 12, 42.00, 5.00],
      ['Doritos Queso Nacho 45g', 5, 'Paquete', 12, 48.00, 6.00],
      ['Cheetos Horneados Queso 42g', 5, 'Paquete', 12, 42.00, 5.00],
      ['Pipocas Dulces Kris 60g', 5, 'Bolsa', 24, 48.00, 3.00],
      ['Platanitos Fritos Salados 50g', 5, 'Bolsa', 24, 60.00, 4.00],
      ['Maní Salado Tostado Venado 40g', 5, 'Bolsa', 24, 48.00, 3.50],
      // Lácteos (cat 6)
      ['Leche Chocolatada PIL 200ml', 6, 'Unidad', 24, 66.00, 4.00],
      ['Leche Frutilla PIL 200ml', 6, 'Unidad', 24, 66.00, 4.00],
      ['Yogurt Bebible PIL Durazno 180ml', 6, 'Botella', 12, 36.00, 4.50],
      ['ChiquiChoc PIL 150ml', 6, 'Unidad', 24, 48.00, 3.00],
      ['Yogurt Griego Delizia Natural 125g', 6, 'Unidad', 12, 48.00, 6.00],
      // Chicles y Mentas (cat 7)
      ['Chicles Bubbaloo Fresa Unidad', 7, 'Unidad', 100, 40.00, 1.00],
      ['Chicles Bubbaloo Menta Unidad', 7, 'Unidad', 100, 40.00, 1.00],
      ['Chicles Trident Menta 5s', 7, 'Paquete', 24, 60.00, 4.00],
      ['Chicles Beldent Menta 10g', 7, 'Paquete', 24, 54.00, 3.50],
      ['Pastillas Halls Mentol Negro', 7, 'Paquete', 24, 48.00, 3.50],
      // Aguas y Energizantes (cat 8)
      ['Agua Mineral Vital sin Gas 600ml', 8, 'Botella', 12, 24.00, 3.50],
      ['Agua Mineral Vital con Gas 600ml', 8, 'Botella', 12, 24.00, 3.50],
      ['Powerade Mora Azul 500ml', 8, 'Botella', 12, 60.00, 7.50],
      ['Energizante Monster Energy 473ml', 8, 'Lata', 12, 132.00, 16.00],
      ['Energizante Volt Azul 300ml', 8, 'Botella', 12, 48.00, 6.00],
      ['Agua Saborizada Aquarius Pera 500ml', 8, 'Botella', 12, 42.00, 5.50],
      // Helados y Postres (cat 9)
      ['Helado Paleta Delizia Crema Americana', 9, 'Unidad', 24, 60.00, 4.00],
      ['Helado Cono Delizia Chocolate', 9, 'Unidad', 12, 66.00, 8.00],
      ['Helado Vasito PIL Vainilla 100ml', 9, 'Unidad', 24, 72.00, 5.00],
      ['Helado Paleta Frutilla Agua Delizia', 9, 'Unidad', 24, 48.00, 3.00],
      // Canasta y Desayuno (cat 10)
      ['Café Copacabana Instantáneo 50g', 10, 'Paquete', 12, 132.00, 15.00],
      ['Barra Cereal Venado Quinua y Miel 25g', 10, 'Unidad', 24, 60.00, 4.00],
      ['Gelatina Lista Fagal Frutilla 120g', 10, 'Unidad', 24, 48.00, 3.50],
      ['Mermelada Venado Durazno Doypack 200g', 10, 'Paquete', 12, 84.00, 10.00]
    ];

    const proveedores = [
      'EMBOL S.A.',
      'Arcor Bolivia',
      'PIL Andina',
      'Pepsico Snacks',
      'Mondelez',
      'Chocolates Para Ti',
      'Industrias Venado',
      'Fagal',
      'Cascada del Sur',
      'Delizia'
    ];

    function proveedorPorCategoria(catId) {
      switch (catId) {
        case 1: return pick(['EMBOL S.A.', 'Cascada del Sur']);
        case 2: return pick(['Arcor Bolivia', 'Chocolates Para Ti', 'Mondelez']);
        case 3: return pick(['Arcor Bolivia', 'Industrias Venado']);
        case 4: return pick(['Fagal', 'Mondelez', 'Arcor Bolivia']);
        case 5: return pick(['Pepsico Snacks', 'Industrias Venado']);
        case 6: return pick(['PIL Andina', 'Delizia']);
        case 7: return pick(['Mondelez', 'Arcor Bolivia']);
        case 8: return pick(['EMBOL S.A.', 'Cascada del Sur']);
        case 9: return pick(['Delizia', 'PIL Andina']);
        default: return pick(['Industrias Venado', 'Fagal']);
      }
    }

    const productosRows = [];
    const productosMeta = [];
    catalogoDef.forEach((p, idx) => {
      const id = idx + 1;
      const barcode = `77700010${String(id).padStart(4, '0')}`;
      const [nombre, catId, unidad, contCaja, costoCaja, precioVenta] = p;
      productosRows.push([
        id,
        barcode,
        nombre,
        `${nombre} — presentación comercial de tienda`,
        catId,
        unidad,
        contCaja,
        null,
        'activo'
      ]);
      productosMeta.push({
        id,
        barcode,
        nombre,
        catId,
        contCaja,
        costoCaja,
        costoUnit: round2(costoCaja / contCaja),
        precioVenta,
        proveedor: proveedorPorCategoria(catId)
      });
    });

    await connection.query(
      'INSERT INTO productos (id, codigo_barras, nombre, descripcion, categoria_id, unidad_medida, contenido_por_caja, imagen_url, estado) VALUES ?',
      [productosRows]
    );

    // 6. Lotes de Compra (120 lotes en total: 60 en SUC-01 y 60 en SUC-02)
    // Garantizando:
    // - 8 lotes vencidos (octubre y principios de noviembre 2026) -> estado 'activo' para semáforo rojo
    // - 15 lotes por vencer en 1 a 14 días (2026-11-27 a 2026-12-10) -> semáforo naranja
    // - 10 lotes con stock crítico (<= 5 unidades)
    // - 87 lotes vigentes (febrero a diciembre 2027) con stock normal
    const lotesRows = [];
    const lotesInfo = [];
    const sucursalProdRows = [];

    // Asignación exacta de los 120 slots (0..59 en SUC-01, 60..119 en SUC-02)
    // Vencidos (8): índices [0,1,2,3] en SUC-01, [60,61,62,63] en SUC-02
    // Por vencer 1-14 días (15): índices [4..11] en SUC-01 (8), [64..70] en SUC-02 (7)
    // Stock crítico <=5 u. (10): índices [12..16] en SUC-01 (5), [71..75] en SUC-02 (5)
    // Vigentes 2027 (87): el resto (43 en SUC-01 + 44 en SUC-02)

    let loteIdCounter = 1;
    for (let sucId = 1; sucId <= 2; sucId++) {
      for (let pIdx = 0; pIdx < 60; pIdx++) {
        const prod = productosMeta[pIdx];
        const globalIdx = (sucId === 1 ? 0 : 60) + pIdx;
        const id = loteIdCounter++;

        let fechaVenc;
        let cajas = randInt(2, 6);
        let stockActual;
        let enOferta = 0;
        let descPct = 0.00;
        let precioOferta = null;
        let fechaIng = fmtDate(addDays(TODAY_BASE, -randInt(5, 35)));

        if (globalIdx < 4 || (globalIdx >= 60 && globalIdx < 64)) {
          // 8 lotes YA VENCIDOS (octubre a principios noviembre 2026)
          const diasAtras = randInt(14, 48); // entre 2026-10-09 y 2026-11-12
          fechaVenc = fmtDate(addDays(TODAY_BASE, -diasAtras));
          cajas = 1;
          stockActual = randInt(8, 22);
          fechaIng = fmtDate(addDays(TODAY_BASE, -(diasAtras + 35)));
        } else if ((globalIdx >= 4 && globalIdx <= 11) || (globalIdx >= 64 && globalIdx <= 70)) {
          // 15 lotes POR VENCER en 1 a 14 días (2026-11-27 a 2026-12-10)
          const diasRest = randInt(1, 14);
          fechaVenc = fmtDate(addDays(TODAY_BASE, diasRest));
          cajas = 2;
          stockActual = randInt(10, 32);
          // Aplicar oferta en algunos lotes próximos a vencer
          if (globalIdx % 2 === 0) {
            enOferta = 1;
            descPct = 20.00;
            precioOferta = round2(prod.precioVenta * 0.8);
          }
          fechaIng = fmtDate(addDays(TODAY_BASE, -randInt(18, 30)));
        } else if ((globalIdx >= 12 && globalIdx <= 16) || (globalIdx >= 71 && globalIdx <= 75)) {
          // 10 lotes STOCK CRÍTICO (<= 5 unidades) con vencimiento 2027
          const diasFut = randInt(95, 320);
          fechaVenc = fmtDate(addDays(TODAY_BASE, diasFut));
          cajas = 1;
          stockActual = randInt(1, 5);
        } else {
          // 87 lotes VIGENTES (febrero a diciembre 2027)
          // 2026-11-26 + 70 días = 2027-02-04; + 385 días = 2027-12-16
          const diasFut = randInt(72, 385);
          fechaVenc = fmtDate(addDays(TODAY_BASE, diasFut));
          cajas = randInt(2, 8);
          const unidIng = cajas * prod.contCaja;
          stockActual = Math.max(15, unidIng - randInt(0, Math.floor(unidIng * 0.3)));
        }

        const unidadesIng = cajas * prod.contCaja;
        // Asegurar proveedor único o distribuido entre las 10 distribuidoras
        const prov = proveedores[(globalIdx + pIdx) % proveedores.length];
        const numLote = `LOT-S${sucId}-${String(id).padStart(3, '0')}`;

        lotesRows.push([
          id,
          sucId,
          prod.id,
          numLote,
          cajas,
          prod.contCaja,
          unidadesIng,
          stockActual,
          prod.costoCaja,
          prod.costoUnit,
          prod.precioVenta,
          fechaVenc,
          enOferta,
          descPct,
          precioOferta,
          fechaIng,
          prov,
          'Compra ingresada por proveedor',
          'activo'
        ]);

        lotesInfo.push({
          id,
          sucId,
          prod,
          numLote,
          stockActual,
          enOferta,
          precioVigente: enOferta ? precioOferta : prod.precioVenta,
          prov
        });

        sucursalProdRows.push([
          sucId,
          prod.id,
          prod.precioVenta,
          enOferta,
          descPct,
          precioOferta,
          stockActual,
          10, // stock_minimo_alerta = 10 para que stock <= 5 dispare alertas
          'activo'
        ]);
      }
    }

    await connection.query(
      `INSERT INTO inventario_lotes
       (id, sucursal_id, producto_id, numero_lote, cajas_compradas, unidades_por_caja, unidades_totales_ingresadas,
        stock_actual_unidades, costo_caja, costo_unitario, precio_venta_normal, fecha_vencimiento, en_oferta,
        descuento_porcentaje, precio_venta_oferta, fecha_ingreso, proveedor, observaciones, estado)
       VALUES ?`,
      [lotesRows]
    );

    await connection.query(
      `INSERT INTO sucursal_productos
       (sucursal_id, producto_id, precio_venta_normal, en_oferta, descuento_porcentaje, precio_venta_oferta,
        stock_total_unidades, stock_minimo_alerta, estado)
       VALUES ?`,
      [sucursalProdRows]
    );

    // 7. Arqueos de Caja (20): 18 cerrados de días anteriores + 2 abiertos hoy (uno por sucursal)
    const cajerosS1 = [2, 4, 6];
    const cajerosS2 = [3, 5];
    const arqueosMeta = [];

    // 9 cerrados en SUC-01 + 9 cerrados en SUC-02 (días -28 a -1)
    let arqId = 1;
    for (let k = 0; k < 9; k++) {
      const daysBack = 28 - k * 3;
      const d = addDays(TODAY_BASE, -daysBack);
      arqueosMeta.push({
        id: arqId++,
        sucId: 1,
        userId: cajerosS1[k % cajerosS1.length],
        dateObj: d,
        dateStr: fmtDate(d),
        montoApertura: pick([150, 200, 250]),
        abierta: false,
        diffManual: k === 2 ? 2.50 : (k === 6 ? -5.00 : 0)
      });
      arqueosMeta.push({
        id: arqId++,
        sucId: 2,
        userId: cajerosS2[k % cajerosS2.length],
        dateObj: addDays(d, 1),
        dateStr: fmtDate(addDays(d, 1)),
        montoApertura: pick([150, 200, 250]),
        abierta: false,
        diffManual: k === 4 ? 1.00 : 0
      });
    }

    // 2 cajas abiertas HOY (2026-11-26): vendedor1 (id 2) en SUC-01 y vendedor2 (id 3) en SUC-02
    arqueosMeta.push({
      id: arqId++,
      sucId: 1,
      userId: 2,
      dateObj: TODAY_BASE,
      dateStr: TODAY_STR,
      montoApertura: 200.00,
      abierta: true,
      diffManual: 0
    });
    arqueosMeta.push({
      id: arqId++,
      sucId: 2,
      userId: 3,
      dateObj: TODAY_BASE,
      dateStr: TODAY_STR,
      montoApertura: 200.00,
      abierta: true,
      diffManual: 0
    });

    // 8. Ventas Históricas y del Día (120 ventas + ~280 líneas de detalle)
    // 102 ventas repartidas del 27 oct al 25 nov + 18 ventas HOY (9 SUC-01, 9 SUC-02)
    const clientesNombres = [
      'Sin Nombre / Consumidor Final',
      'Juan Pérez',
      'María Quispe',
      'Carlos Torrez',
      'Lucía Mendoza',
      'Fernando Rojas',
      'Sofía Salazar',
      'Marco Antonio Yucra'
    ];

    const lotesS1 = lotesInfo.filter(l => l.sucId === 1);
    const lotesS2 = lotesInfo.filter(l => l.sucId === 2);

    const ventasRows = [];
    const ventaDetallesRows = [];
    const arqueoTotals = {};
    for (const a of arqueosMeta) {
      arqueoTotals[a.id] = {
        efectivo: 0,
        qr: 0,
        gastosEf: 0,
        ingExtraEf: 0
      };
    }

    function getArqueoForDate(sucId, dateStr) {
      const exact = arqueosMeta.find(a => a.sucId === sucId && a.dateStr === dateStr);
      if (exact) return exact;
      // En días sin cierre propio, asociar al último arqueo cerrado anterior de esa tienda
      const candidates = arqueosMeta.filter(a => a.sucId === sucId && !a.abierta && a.dateStr <= dateStr);
      if (candidates.length > 0) return candidates[candidates.length - 1];
      return arqueosMeta.find(a => a.sucId === sucId && !a.abierta);
    }

    for (let vIdx = 0; vIdx < 120; vIdx++) {
      const ventaId = vIdx + 1;
      const esHoy = vIdx >= 102; // Últimas 18 ventas son de hoy 2026-11-26
      const sucId = esHoy ? ((vIdx - 102) < 9 ? 1 : 2) : (vIdx % 2 === 0 ? 1 : 2);

      let fechaObj;
      let hora;
      let minuto;
      if (esHoy) {
        fechaObj = TODAY_BASE;
        hora = randInt(8, 18);
        minuto = randInt(0, 59);
      } else {
        const diasAtras = 30 - Math.floor((vIdx / 102) * 29) - 1; // 2026-10-27 .. 2026-11-25
        fechaObj = addDays(TODAY_BASE, -Math.max(1, diasAtras));
        hora = randInt(8, 21);
        minuto = randInt(0, 59);
      }

      const fechaStr = fmtDate(fechaObj);
      const fechaVentaDT = fmtDateTime(fechaObj, hora, minuto, randInt(0, 59));
      const arq = esHoy
        ? arqueosMeta.find(a => a.sucId === sucId && a.abierta)
        : getArqueoForDate(sucId, fechaStr);
      const userId = esHoy ? (sucId === 1 ? 2 : 3) : arq.userId;

      const metodoPago = (vIdx % 20) < 13 ? 'efectivo' : 'qr_simple'; // 65% efectivo, 35% qr_simple
      const tipoComp = metodoPago === 'qr_simple' ? 'factura_qr' : 'nota_venta';
      const clienteNom = pick(clientesNombres);
      const clienteCi = clienteNom === 'Sin Nombre / Consumidor Final' ? '0' : String(randInt(5100000, 8999999));

      // Entre 2 y 3 líneas por venta -> ~280-300 detalles
      const numLineas = (vIdx % 3 === 0) ? 3 : 2;
      const poolLotes = sucId === 1 ? lotesS1 : lotesS2;
      const usedProdIds = new Set();

      let subtotalVenta = 0;
      for (let li = 0; li < numLineas; li++) {
        let lote = pick(poolLotes);
        let guard = 0;
        while (usedProdIds.has(lote.prod.id) && guard < 10) {
          lote = pick(poolLotes);
          guard++;
        }
        usedProdIds.add(lote.prod.id);

        const cantidad = randInt(1, 4);
        const precioUnit = round2(lote.precioVigente);
        const costoUnit = round2(lote.prod.costoUnit);
        const lineaSub = round2(cantidad * precioUnit);
        subtotalVenta = round2(subtotalVenta + lineaSub);

        ventaDetallesRows.push([
          ventaId,
          lote.prod.id,
          lote.id,
          cantidad,
          precioUnit,
          costoUnit,
          lote.enOferta ? 1 : 0,
          0.00,
          lineaSub
        ]);
      }

      const montoTotal = round2(subtotalVenta);
      let montoRecibido = montoTotal;
      let cambio = 0.00;
      if (metodoPago === 'efectivo') {
        const billete = montoTotal <= 10 ? 10 : (montoTotal <= 20 ? 20 : (montoTotal <= 50 ? 50 : (montoTotal <= 100 ? 100 : 200)));
        montoRecibido = billete;
        cambio = round2(billete - montoTotal);
      }

      if (arq) {
        if (metodoPago === 'efectivo') {
          arqueoTotals[arq.id].efectivo = round2(arqueoTotals[arq.id].efectivo + montoTotal);
        } else {
          arqueoTotals[arq.id].qr = round2(arqueoTotals[arq.id].qr + montoTotal);
        }
      }

      const comp = `VNT-S${sucId}-${fechaStr.replace(/-/g, '')}-${String(ventaId).padStart(4, '0')}`;
      ventasRows.push([
        ventaId,
        sucId,
        userId,
        arq ? arq.id : null,
        comp,
        tipoComp,
        clienteNom,
        clienteCi,
        metodoPago,
        subtotalVenta,
        0.00,
        montoTotal,
        montoRecibido,
        cambio,
        'completada',
        fechaVentaDT
      ]);
    }

    // 9. Ingresos y Egresos (40 movimientos del último mes)
    const conceptosEgreso = [
      ['Alquiler', 'Alquiler mensual local comercial', 'Propietario Inmueble', 'transferencia_qr', 1800, 2200],
      ['Servicios Básicos', 'Pago factura energía eléctrica CESSA', 'CESSA Sucre', 'efectivo', 180, 320],
      ['Servicios Básicos', 'Pago factura agua potable ELAPAS', 'ELAPAS Sucre', 'efectivo', 65, 120],
      ['Servicios Básicos', 'Servicio internet fibra óptica', 'ENTEL S.A.', 'transferencia_qr', 190, 240],
      ['Proveedor', 'Pago reposición rápida de bebidas', 'EMBOL S.A.', 'efectivo', 140, 380],
      ['Proveedor', 'Cancelación nota de entrega lácteos', 'PIL Andina', 'transferencia_qr', 220, 480],
      ['Limpieza', 'Compra detergente, lavandina y bolsas', 'Comercial Central', 'efectivo', 35, 85],
      ['Viáticos/Otros', 'Pasajes mensajería y envíos entre tiendas', 'Personal Tienda', 'efectivo', 15, 45],
      ['Impuesto RTS', 'Pago bimestral Régimen Tributario Simplificado', 'SIN Bolivia', 'transferencia_qr', 150, 280]
    ];
    const conceptosIngreso = [
      ['Reposición de Caja', 'Reposición de sencillo y billetes de Bs. 10', 'Gerencia Candy Boom', 'efectivo', 100, 200],
      ['Fondo Adicional', 'Refuerzo de caja fin de semana', 'Gerencia Candy Boom', 'efectivo', 150, 300],
      ['Otros Ingresos', 'Devolución de envases retornables', 'EMBOL S.A.', 'efectivo', 45, 90]
    ];

    const egresosRows = [];
    for (let gIdx = 0; gIdx < 40; gIdx++) {
      const esIngreso = gIdx % 5 === 0; // 8 ingresos extra, 32 egresos
      const sucId = gIdx % 2 === 0 ? 1 : 2;
      const esHoy = gIdx >= 36; // 4 movimientos hoy (2 por sucursal)
      const fechaObj = esHoy ? TODAY_BASE : addDays(TODAY_BASE, -randInt(1, 29));
      const fechaStr = fmtDate(fechaObj);
      const arq = esHoy
        ? arqueosMeta.find(a => a.sucId === sucId && a.abierta)
        : getArqueoForDate(sucId, fechaStr);
      const userId = esHoy ? (sucId === 1 ? 2 : 3) : arq.userId;

      if (esIngreso) {
        const [cat, conc, ben, met, minM, maxM] = pick(conceptosIngreso);
        const monto = round2(randInt(minM, maxM));
        if (arq && met === 'efectivo') {
          arqueoTotals[arq.id].ingExtraEf = round2(arqueoTotals[arq.id].ingExtraEf + monto);
        }
        egresosRows.push([
          sucId,
          userId,
          arq ? arq.id : null,
          'ingreso',
          cat,
          monto,
          `ING-${String(gIdx + 1).padStart(4, '0')}`,
          conc,
          ben,
          met,
          fmtDateTime(fechaObj, randInt(9, 17), randInt(0, 59))
        ]);
      } else {
        const [cat, conc, ben, met, minM, maxM] = pick(conceptosEgreso);
        const monto = round2(randInt(minM, maxM));
        if (arq && met === 'efectivo') {
          arqueoTotals[arq.id].gastosEf = round2(arqueoTotals[arq.id].gastosEf + monto);
        }
        egresosRows.push([
          sucId,
          userId,
          arq ? arq.id : null,
          'egreso',
          cat,
          monto,
          `EGR-${String(gIdx + 1).padStart(4, '0')}`,
          conc,
          ben,
          met,
          fmtDateTime(fechaObj, randInt(9, 19), randInt(0, 59))
        ]);
      }
    }

    // Construir filas finales de arqueos_caja con los totales exactos
    const arqueosRows = arqueosMeta.map(a => {
      const tot = arqueoTotals[a.id];
      const esperado = round2(a.montoApertura + tot.efectivo + tot.ingExtraEf - tot.gastosEf);
      const real = a.abierta ? null : round2(esperado + a.diffManual);
      const diff = a.abierta ? null : round2(real - esperado);
      return [
        a.id,
        a.sucId,
        a.userId,
        a.montoApertura,
        a.abierta ? null : esperado,
        real,
        diff,
        tot.efectivo,
        tot.qr,
        0.00,
        tot.gastosEf,
        tot.ingExtraEf,
        fmtDateTime(a.dateObj, 8, 0, 0),
        a.abierta ? null : fmtDateTime(a.dateObj, 21, 30, 0),
        a.abierta ? 'abierta' : 'cerrada',
        a.abierta ? 'Turno en curso' : (diff === 0 ? 'Cuadre exacto de turno' : 'Cierre con diferencia menor registrada')
      ];
    });

    await connection.query(
      `INSERT INTO arqueos_caja
       (id, sucursal_id, usuario_id, monto_apertura, monto_cierre_sistema, monto_cierre_real, diferencia,
        total_ventas_efectivo, total_ventas_qr, total_ventas_tarjeta, total_gastos, total_ingresos_extra,
        fecha_apertura, fecha_cierre, estado, observaciones)
       VALUES ?`,
      [arqueosRows]
    );

    await connection.query(
      `INSERT INTO ventas
       (id, sucursal_id, usuario_id, arqueo_id, numero_comprobante, tipo_comprobante, cliente_nombre,
        cliente_nit_ci, metodo_pago, subtotal, descuento, monto_total, monto_recibido, cambio, estado, fecha_venta)
       VALUES ?`,
      [ventasRows]
    );

    await connection.query(
      `INSERT INTO venta_detalles
       (venta_id, producto_id, lote_id, cantidad, precio_unitario, costo_unitario, es_oferta, descuento_aplicado, subtotal)
       VALUES ?`,
      [ventaDetallesRows]
    );

    await connection.query(
      `INSERT INTO egresos_gastos
       (sucursal_id, usuario_id, arqueo_id, tipo, categoria_gasto, monto, comprobante_nro, concepto, beneficiario, metodo_pago, fecha_gasto)
       VALUES ?`,
      [egresosRows]
    );

    // 10. Traspasos entre Tiendas (15): 13 completados + 2 pendientes
    const traspasosRows = [];
    for (let tIdx = 0; tIdx < 15; tIdx++) {
      const esPendiente = tIdx >= 13;
      const origSuc = tIdx % 2 === 0 ? 1 : 2;
      const destSuc = origSuc === 1 ? 2 : 1;
      const poolOrig = origSuc === 1 ? lotesS1 : lotesS2;
      const loteSel = poolOrig[(tIdx * 3 + 17) % poolOrig.length];
      const fechaSol = addDays(TODAY_BASE, esPendiente ? 0 : -(28 - tIdx * 2));
      const cantidad = randInt(6, 18);

      traspasosRows.push([
        `TRP-2026-${String(tIdx + 1).padStart(4, '0')}`,
        origSuc,
        destSuc,
        1,
        esPendiente ? null : (destSuc === 1 ? 2 : 3),
        loteSel.prod.id,
        loteSel.id,
        cantidad,
        esPendiente ? 'pendiente' : 'completado',
        esPendiente ? 'Solicitud de reposición urgente en vitrina' : 'Reposición regular entre sucursales',
        fmtDateTime(fechaSol, randInt(9, 16), randInt(0, 59)),
        esPendiente ? null : fmtDateTime(fechaSol, randInt(17, 20), randInt(0, 59))
      ]);
    }

    await connection.query(
      `INSERT INTO traspasos_sucursales
       (codigo_traspaso, sucursal_origen_id, sucursal_destino_id, usuario_envia_id, usuario_recibe_id,
        producto_id, lote_id, cantidad, estado, motivo, fecha_solicitud, fecha_recepcion)
       VALUES ?`,
      [traspasosRows]
    );

    // 11. Auditoría de Actividades (150 registros cronológicos de los últimos 30 días)
    const auditoriaRows = [];
    for (let aIdx = 0; aIdx < 150; aIdx++) {
      const diasAtras = Math.floor(((149 - aIdx) / 149) * 29); // cronológico ascendente hacia hoy
      const fechaObj = addDays(TODAY_BASE, -diasAtras);
      const hora = randInt(8, 21);
      const min = randInt(0, 59);
      const fechaAud = fmtDateTime(fechaObj, hora, min, randInt(0, 59));

      const tipoIdx = aIdx % 7;
      let userId;
      let sucId;
      let modulo;
      let accion;
      let detalle;

      if (tipoIdx === 0) {
        userId = randInt(1, 6);
        sucId = userId === 1 ? null : usuarios[userId - 1][5];
        modulo = 'Login';
        accion = 'Inicio de sesión';
        detalle = `Ingreso exitoso al sistema (${usuarios[userId - 1][1]})`;
      } else if (tipoIdx === 1 || tipoIdx === 2) {
        const vRow = ventasRows[aIdx % ventasRows.length];
        userId = vRow[2];
        sucId = vRow[1];
        modulo = 'POS';
        accion = 'Venta registrada';
        detalle = `Registró venta ${vRow[4]} por Bs. ${Number(vRow[11]).toFixed(2)} (${vRow[8]})`;
      } else if (tipoIdx === 3) {
        const lInf = lotesInfo[aIdx % lotesInfo.length];
        userId = lInf.sucId === 1 ? 2 : 3;
        sucId = lInf.sucId;
        modulo = 'Compras';
        accion = 'Compra ingresada';
        detalle = `Ingresó lote ${lInf.numLote} de ${lInf.prod.nombre} (${lInf.prov})`;
      } else if (tipoIdx === 4) {
        const lInf = lotesInfo[(aIdx + 4) % lotesInfo.length];
        userId = 1;
        sucId = lInf.sucId;
        modulo = 'Vencimientos';
        accion = 'Oferta aplicada';
        detalle = `Aplicó rebaja promocional al lote ${lInf.numLote} de ${lInf.prod.nombre}`;
      } else if (tipoIdx === 5) {
        const eg = egresosRows[aIdx % egresosRows.length];
        userId = eg[1];
        sucId = eg[0];
        modulo = 'Ingresos/Egresos';
        accion = eg[3] === 'ingreso' ? 'Ingreso extra registrado' : 'Egreso registrado';
        detalle = `${eg[7]} - Bs. ${Number(eg[5]).toFixed(2)}`;
      } else {
        const arq = arqueosMeta[aIdx % 18];
        userId = arq.userId;
        sucId = arq.sucId;
        modulo = 'Caja';
        accion = 'Cierre de caja';
        detalle = `Cerró turno de caja en Sucursal ${arq.sucId}`;
      }

      auditoriaRows.push([
        userId,
        sucId,
        modulo,
        accion,
        detalle,
        `192.168.1.${10 + (userId * 2)}`,
        fechaAud
      ]);
    }

    await connection.query(
      `INSERT INTO auditoria_actividades (usuario_id, sucursal_id, modulo, accion, detalle, ip_equipo, created_at) VALUES ?`,
      [auditoriaRows]
    );

    // Asegurar configuracion_alertas de WhatsApp
    await connection.query(
      `INSERT INTO configuracion_alertas (clave, telefono, activo, hora_envio)
       VALUES ('whatsapp_gerencia', '+59170612345', 1, '08:00')
       ON DUPLICATE KEY UPDATE telefono = VALUES(telefono), activo = VALUES(activo)`
    );

    await connection.commit();

    const elapsedMs = Date.now() - tStart;

    // 12. Conteo real de filas insertadas por tabla
    const tablasResumen = [
      'sucursales',
      'usuarios',
      'categorias',
      'productos',
      'sucursal_productos',
      'inventario_lotes',
      'arqueos_caja',
      'ventas',
      'venta_detalles',
      'egresos_gastos',
      'traspasos_sucursales',
      'auditoria_actividades',
      'configuracion_alertas'
    ];

    console.log('\nConteo exacto de filas insertadas:');
    console.log('--------------------------------------------------------------------');
    let granTotal = 0;
    for (const tabla of tablasResumen) {
      const [[{ total }]] = await connection.query(`SELECT COUNT(*) AS total FROM \`${tabla}\``);
      granTotal += Number(total);
      console.log(`  - ${tabla.padEnd(24, ' ')}: ${total}`);
    }
    console.log('--------------------------------------------------------------------');
    console.log(`  TOTAL DE REGISTROS      : ${granTotal}`);
    console.log(`  Tiempo de ejecución     : ${(elapsedMs / 1000).toFixed(2)}s`);

    // Verificación rápida de semáforos y estados de lotes
    const [[loteStats]] = await connection.query(`
      SELECT
        SUM(CASE WHEN fecha_vencimiento <= '2026-11-26' THEN 1 ELSE 0 END) AS vencidos,
        SUM(CASE WHEN fecha_vencimiento BETWEEN '2026-11-27' AND '2026-12-10' THEN 1 ELSE 0 END) AS proximos_1_14,
        SUM(CASE WHEN stock_actual_unidades <= 5 THEN 1 ELSE 0 END) AS stock_critico,
        SUM(CASE WHEN fecha_vencimiento >= '2027-02-01' AND stock_actual_unidades > 5 THEN 1 ELSE 0 END) AS vigentes_normales
      FROM inventario_lotes
    `);
    console.log('\nDistribución de lotes (semáforos):');
    console.log(`  - Vencidos (Rojo)             : ${loteStats.vencidos}`);
    console.log(`  - Por vencer 1-14 d (Naranja) : ${loteStats.proximos_1_14}`);
    console.log(`  - Stock crítico (<= 5 u.)     : ${loteStats.stock_critico}`);
    console.log(`  - Vigentes 2027 (Normal)      : ${loteStats.vigentes_normales}`);

    console.log('\nCredenciales de acceso (Contraseña universal: 123456):');
    console.log('  - Administrador Global : admin@candyboom.bo / 123456');
    console.log('  - Cajero SUC-01 Matriz : vendedor1@candyboom.bo / 123456');
    console.log('  - Cajero SUC-02 Siles  : vendedor2@candyboom.bo / 123456');
    console.log('  - Cajera SUC-01        : cajero3@candyboom.bo / 123456');
    console.log('  - Cajero SUC-02        : cajero4@candyboom.bo / 123456');
    console.log('  - Cajera SUC-01        : cajero5@candyboom.bo / 123456');
    console.log('====================================================================');
  } catch (error) {
    await connection.rollback();
    console.error('[Error] Falló el seed masivo:', error);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

if (require.main === module) {
  seedMasivo();
}

module.exports = seedMasivo;
