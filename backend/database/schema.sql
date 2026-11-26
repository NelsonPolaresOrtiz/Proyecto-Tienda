-- ========================================================
-- Candy Boom - Sistema POS y Gestión Multi-Sucursal
-- Base de Datos MySQL / MariaDB (Bolivia - Moneda: Bs.)
-- Aislamiento Estricto por sucursal_id
-- ========================================================

CREATE DATABASE IF NOT EXISTS candy_boom_db 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE candy_boom_db;

-- Desactivar restricciones de llaves foráneas para recreación limpia
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS auditoria_actividades;
DROP TABLE IF EXISTS ajustes_stock;
DROP TABLE IF EXISTS venta_detalles;
DROP TABLE IF EXISTS ventas;
DROP TABLE IF EXISTS egresos_gastos;
DROP TABLE IF EXISTS arqueos_caja;
DROP TABLE IF EXISTS traspasos_sucursales;
DROP TABLE IF EXISTS inventario_lotes;
DROP TABLE IF EXISTS sucursal_productos;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS sucursales;

SET FOREIGN_KEY_CHECKS = 1;

-- --------------------------------------------------------
-- 1. TABLA: sucursales
-- Precargas requeridas: Matriz (Sucursal 1) y Sucursal 2
-- --------------------------------------------------------
CREATE TABLE sucursales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    ciudad VARCHAR(80) NOT NULL DEFAULT 'Sucre',
    direccion VARCHAR(255) NOT NULL,
    telefono VARCHAR(50) NULL,
    es_matriz TINYINT(1) NOT NULL DEFAULT 0,
    estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sucursales_estado (estado),
    INDEX idx_sucursales_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 2. TABLA: usuarios
-- Admin global: sucursal_id = NULL
-- Vendedor: asignado a una sucursal_id obligatoria
-- Estado: activo / inactivo
-- --------------------------------------------------------
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    rol ENUM('admin', 'vendedor') NOT NULL DEFAULT 'vendedor',
    sucursal_id INT NULL,
    ci VARCHAR(30) NULL,
    telefono VARCHAR(30) NULL,
    estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
    ultimo_login DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE SET NULL,
    INDEX idx_usuarios_rol (rol),
    INDEX idx_usuarios_email (email),
    INDEX idx_usuarios_sucursal (sucursal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 3. TABLA: categorias
-- Categorías estándar de minimarket boliviano
-- --------------------------------------------------------
CREATE TABLE categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT NULL,
    icono VARCHAR(60) NOT NULL DEFAULT 'tag',
    color VARCHAR(30) NOT NULL DEFAULT '#0052CC',
    estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_categorias_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 4. TABLA: productos (Catálogo Maestro)
-- --------------------------------------------------------
CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_barras VARCHAR(60) NOT NULL UNIQUE,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT NULL,
    categoria_id INT NOT NULL,
    unidad_medida VARCHAR(30) NOT NULL DEFAULT 'Unidad',
    contenido_por_caja INT NOT NULL DEFAULT 1 COMMENT 'Unidades por caja estándar: 12, 24, 46, 100, etc.',
    imagen_url VARCHAR(255) NULL,
    estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id),
    INDEX idx_productos_categoria (categoria_id),
    INDEX idx_productos_codigo (codigo_barras),
    INDEX idx_productos_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 5. TABLA: sucursal_productos
-- Consolidado de stock y estado por sucursal
-- --------------------------------------------------------
CREATE TABLE sucursal_productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sucursal_id INT NOT NULL,
    producto_id INT NOT NULL,
    precio_venta_normal DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'En Bolivianos (Bs.)',
    en_oferta TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 si está en promoción, 0 normal',
    descuento_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    precio_venta_oferta DECIMAL(10,2) NULL COMMENT 'En Bolivianos (Bs.)',
    stock_total_unidades INT NOT NULL DEFAULT 0,
    stock_minimo_alerta INT NOT NULL DEFAULT 5,
    estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sucursal_producto (sucursal_id, producto_id),
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    INDEX idx_sp_sucursal (sucursal_id),
    INDEX idx_sp_producto (producto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 6. TABLA: inventario_lotes
-- Lotes de mercadería con cajas compradas, unidades por caja (12, 24, 46, 100, etc.),
-- stock actual, costos, precios, descuentos y vencimientos (Trazabilidad FIFO por sucursal)
-- --------------------------------------------------------
CREATE TABLE inventario_lotes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sucursal_id INT NOT NULL,
    producto_id INT NOT NULL,
    numero_lote VARCHAR(60) NOT NULL,
    cajas_compradas DECIMAL(10,2) NOT NULL DEFAULT 1.00 COMMENT 'Cantidad de cajas adquiridas al proveedor',
    unidades_por_caja INT NOT NULL DEFAULT 1 COMMENT 'Empaque: 12, 24, 46, 100 u.',
    unidades_totales_ingresadas INT NOT NULL COMMENT 'cajas_compradas * unidades_por_caja',
    stock_actual_unidades INT NOT NULL DEFAULT 0 COMMENT 'Stock disponible en unidades sueltas para venta',
    costo_caja DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Costo pagado por caja completa en Bs.',
    costo_unitario DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'costo_caja / unidades_por_caja en Bs.',
    precio_venta_normal DECIMAL(10,2) NOT NULL COMMENT 'Precio venta público en Bs.',
    fecha_vencimiento DATE NULL COMMENT 'Fecha de expiración para control de mermas',
    en_oferta TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Indica si este lote tiene precio promocional',
    descuento_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Porcentaje de descuento aplicado (0% - 100%)',
    precio_venta_oferta DECIMAL(10,2) NULL COMMENT 'Precio con descuento promocional en Bs.',
    fecha_ingreso DATE NOT NULL,
    proveedor VARCHAR(150) NULL,
    observaciones VARCHAR(255) NULL,
    estado ENUM('activo', 'agotado', 'vencido') NOT NULL DEFAULT 'activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    INDEX idx_lotes_sucursal (sucursal_id),
    INDEX idx_lotes_producto (producto_id),
    INDEX idx_lotes_vencimiento (fecha_vencimiento),
    INDEX idx_lotes_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 7. TABLA: arqueos_caja
-- Control de apertura y cierre de turno por cajero y sucursal
-- --------------------------------------------------------
CREATE TABLE arqueos_caja (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sucursal_id INT NOT NULL,
    usuario_id INT NOT NULL,
    monto_apertura DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Efectivo inicial en caja (Bs.)',
    monto_cierre_sistema DECIMAL(10,2) NULL COMMENT 'Calculado automáticamente por el sistema en Bs.',
    monto_cierre_real DECIMAL(10,2) NULL COMMENT 'Conteo físico reportado por el cajero en Bs.',
    diferencia DECIMAL(10,2) NULL COMMENT 'Sobrante (+) o Faltante (-) en Bs.',
    total_ventas_efectivo DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_ventas_qr DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_ventas_tarjeta DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_gastos DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_ingresos_extra DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    fecha_apertura DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre DATETIME NULL,
    estado ENUM('abierta', 'cerrada') NOT NULL DEFAULT 'abierta',
    observaciones TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    INDEX idx_arqueos_sucursal (sucursal_id),
    INDEX idx_arqueos_usuario (usuario_id),
    INDEX idx_arqueos_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 8. TABLA: ventas
-- Registro central de cada transacción POS por sucursal
-- --------------------------------------------------------
CREATE TABLE ventas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sucursal_id INT NOT NULL,
    usuario_id INT NOT NULL,
    arqueo_id INT NULL,
    numero_comprobante VARCHAR(50) NOT NULL UNIQUE,
    tipo_comprobante ENUM('recibo', 'nota_venta', 'factura_qr') NOT NULL DEFAULT 'nota_venta',
    cliente_nombre VARCHAR(120) NOT NULL DEFAULT 'Sin Nombre / Consumidor Final',
    cliente_nit_ci VARCHAR(30) NOT NULL DEFAULT '0',
    metodo_pago ENUM('efectivo', 'qr_simple', 'tarjeta', 'mixto') NOT NULL DEFAULT 'efectivo',
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    descuento DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    monto_total DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Total cobrado en Bolivianos (Bs.)',
    monto_recibido DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    cambio DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    estado ENUM('completada', 'anulada') NOT NULL DEFAULT 'completada',
    fecha_venta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (arqueo_id) REFERENCES arqueos_caja(id) ON DELETE SET NULL,
    INDEX idx_ventas_sucursal (sucursal_id),
    INDEX idx_ventas_fecha (fecha_venta),
    INDEX idx_ventas_comprobante (numero_comprobante),
    INDEX idx_ventas_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 9. TABLA: venta_detalles
-- Renglones individuales de la venta con lote y márgenes
-- --------------------------------------------------------
CREATE TABLE venta_detalles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venta_id INT NOT NULL,
    producto_id INT NOT NULL,
    lote_id INT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL COMMENT 'Precio unitario cobrado en Bs.',
    costo_unitario DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Costo unitario en Bs. para margen',
    es_oferta TINYINT(1) NOT NULL DEFAULT 0,
    descuento_aplicado DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    subtotal DECIMAL(10,2) NOT NULL COMMENT 'Monto línea en Bs.',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (lote_id) REFERENCES inventario_lotes(id) ON DELETE SET NULL,
    INDEX idx_vd_venta (venta_id),
    INDEX idx_vd_producto (producto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 10. TABLA: egresos_gastos
-- Egresos de caja chica con conceptos del mercado boliviano
-- --------------------------------------------------------
CREATE TABLE egresos_gastos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sucursal_id INT NOT NULL,
    usuario_id INT NOT NULL,
    arqueo_id INT NULL,
    tipo ENUM('egreso', 'ingreso') NOT NULL DEFAULT 'egreso',
    categoria_gasto VARCHAR(80) NOT NULL,
    monto DECIMAL(10,2) NOT NULL COMMENT 'Monto del movimiento en Bs.',
    comprobante_nro VARCHAR(50) NULL,
    concepto VARCHAR(255) NOT NULL,
    beneficiario VARCHAR(150) NULL,
    metodo_pago ENUM('efectivo', 'transferencia_qr', 'cheque') NOT NULL DEFAULT 'efectivo',
    fecha_gasto DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (arqueo_id) REFERENCES arqueos_caja(id) ON DELETE SET NULL,
    INDEX idx_gastos_sucursal (sucursal_id),
    INDEX idx_gastos_categoria (categoria_gasto),
    INDEX idx_gastos_fecha (fecha_gasto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 11. TABLA: traspasos_sucursales
-- Envío, tránsito y recepción de mercadería entre sucursales
-- --------------------------------------------------------
CREATE TABLE traspasos_sucursales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_traspaso VARCHAR(50) NOT NULL UNIQUE,
    sucursal_origen_id INT NOT NULL,
    sucursal_destino_id INT NOT NULL,
    usuario_envia_id INT NOT NULL,
    usuario_recibe_id INT NULL,
    producto_id INT NOT NULL,
    lote_id INT NULL,
    cantidad INT NOT NULL,
    estado ENUM('pendiente', 'en_transito', 'completado', 'cancelado') NOT NULL DEFAULT 'pendiente',
    motivo VARCHAR(255) NULL,
    fecha_solicitud DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_recepcion DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sucursal_origen_id) REFERENCES sucursales(id),
    FOREIGN KEY (sucursal_destino_id) REFERENCES sucursales(id),
    FOREIGN KEY (usuario_envia_id) REFERENCES usuarios(id),
    FOREIGN KEY (usuario_recibe_id) REFERENCES usuarios(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (lote_id) REFERENCES inventario_lotes(id) ON DELETE SET NULL,
    INDEX idx_traspaso_origen (sucursal_origen_id),
    INDEX idx_traspaso_destino (sucursal_destino_id),
    INDEX idx_traspaso_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 12. TABLA: ajustes_stock (Auditoría de Mermas y Conteos Físicos)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ajustes_stock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sucursal_id INT NOT NULL,
    producto_id INT NOT NULL,
    usuario_id INT NOT NULL,
    tipo_ajuste VARCHAR(60) NOT NULL COMMENT 'merma, conteo_fisico, vencimiento, daño',
    stock_anterior INT NOT NULL,
    stock_nuevo INT NOT NULL,
    diferencia INT NOT NULL,
    motivo TEXT NOT NULL,
    fecha_ajuste DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    INDEX idx_ajuste_sucursal (sucursal_id),
    INDEX idx_ajuste_producto (producto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 13. TABLA: auditoria_actividades (Auditoría Total por Usuario y Sucursal)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria_actividades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    sucursal_id INT NULL,
    modulo VARCHAR(60) NOT NULL,
    accion VARCHAR(100) NOT NULL,
    detalle TEXT NOT NULL,
    ip_equipo VARCHAR(60) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE SET NULL,
    INDEX idx_aud_usuario (usuario_id),
    INDEX idx_aud_sucursal (sucursal_id),
    INDEX idx_aud_modulo (modulo),
    INDEX idx_aud_fecha (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================
-- PRECARGAS OBLIGATORIAS (SEEDS)
-- ========================================================

-- 1. Sucursales Precargadas (Sucre, Chuquisaca)
INSERT INTO sucursales (id, nombre, codigo, ciudad, direccion, telefono, es_matriz, estado) VALUES
(1, 'Candy Boom - Casa Matriz', 'SUC-01', 'Sucre', 'Calle Nicolás Ortiz #45 (Zona Central), Sucre', '4-6451234', 1, 'activo'),
(2, 'Candy Boom - Sucursal 2', 'SUC-02', 'Sucre', 'Av. Hernando Siles #820, Sucre', '4-6467890', 0, 'activo')
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), ciudad=VALUES(ciudad), direccion=VALUES(direccion), telefono=VALUES(telefono);

-- 2. Categorías Comerciales Requeridas
INSERT INTO categorias (id, nombre, descripcion, icono, color, estado) VALUES
(1, 'Golosinas', 'Chocolates, gomitas, caramelos, chupetes y confitería variada', 'candy', '#FF6B00', 'activo'),
(2, 'Snacks', 'Papas fritas crujientes, pipocas, platanitos y galletas saladas', 'cookie', '#F59E0B', 'activo'),
(3, 'Bebidas Frías', 'Gaseosas, jugos naturales, energizantes y aguas purificadas', 'bottle-water', '#0052CC', 'activo'),
(4, 'Helados', 'Paletas artesanales, conos, helados de crema y potes familiares', 'ice-cream', '#EC4899', 'activo'),
(5, 'Canasta Familiar', 'Leche PIL, café boliviano de los Yungas, té, azúcar y abarrotes', 'shopping-basket', '#10B981', 'activo'),
(6, 'Útiles Escolares', 'Cuadernos, bolígrafos, lápices, gomas de borrar y marcadores', 'pencil', '#8B5CF6', 'activo'),
(7, 'Productos Saludables', 'Barras de cereal andino, quinua inflada, frutos secos y miel pura', 'leaf', '#14B8A6', 'activo')
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre);

-- 3. Usuarios de prueba (Admin Global: sucursal_id = NULL / Vendedor asignado a sucursal)
-- Contraseña Admin: Admin123*
-- Contraseña Vendedores: Ventas123*
INSERT INTO usuarios (id, nombre, email, password, rol, sucursal_id, ci, telefono, estado) VALUES
(1, 'Gerencia Candy Boom', 'admin@candyboom.bo', '$2b$10$l09s3Q04nBduxHDKpdk0B.3JBM4Mp8F3y68bKpjZLVdcrZF7D/S..', 'admin', NULL, '6849201 LP', '70612345', 'activo'),
(2, 'Carlos Mamani (Cajero Matriz)', 'vendedor1@candyboom.bo', '$2b$10$BHew9cyzdJzdQcDoOfKcReFbDLsntwcmtQvzpJSNKy5OLNua4RU.O', 'vendedor', 1, '7129482 LP', '77234567', 'activo'),
(3, 'Maritza Quispe (Cajera Sucursal 2)', 'vendedor2@candyboom.bo', '$2b$10$BHew9cyzdJzdQcDoOfKcReFbDLsntwcmtQvzpJSNKy5OLNua4RU.O', 'vendedor', 2, '8329410 LP', '78912345', 'activo')
ON DUPLICATE KEY UPDATE email=VALUES(email), password=VALUES(password);

-- 4. Catálogo Maestro de Productos
INSERT INTO productos (id, codigo_barras, nombre, descripcion, categoria_id, unidad_medida, contenido_por_caja, estado) VALUES
(1, '7771234001', 'Chocolates Sublime Clásico 30g', 'Chocolate con maní tostado seleccionado', 1, 'Unidad', 24, 'activo'),
(2, '7771234002', 'Gomitas Mogul Ositos 50g', 'Gomitas masticables sabores a frutas variadas', 1, 'Unidad', 46, 'activo'),
(3, '7771234003', 'Chicles Bubbaloo Fresa', 'Goma de mascar con centro líquido sabor fresa', 1, 'Unidad', 100, 'activo'),
(4, '7771234004', 'Papas Fritas Lays Clásicas 40g', 'Papas crujientes con sal natural', 2, 'Paquete', 12, 'activo'),
(5, '7771234005', 'Galletas Oreo Clásica 36g', 'Galletas de cacao rellenas con crema de vainilla', 2, 'Paquete', 24, 'activo'),
(6, '7771234006', 'Coca-Cola Sabor Original 500ml', 'Bebida gaseosa refrescante personal', 3, 'Botella', 12, 'activo'),
(7, '7771234007', 'Agua Mineral Vital sin Gas 600ml', 'Agua pura de manantial', 3, 'Botella', 12, 'activo'),
(8, '7771234008', 'Helado Paleta Sublime D’Onofrio', 'Paleta cubierta de chocolate con trozos de maní', 4, 'Unidad', 24, 'activo'),
(9, '7771234009', 'Leche Chocolatada Pil 200ml', 'Bebida láctea esterilizada UHT con cacao boliviano', 5, 'Unidad', 24, 'activo'),
(10, '7771234010', 'Café Destilado Yungas La Paz 50g', 'Café 100% puro tostado y molido de los Yungas', 5, 'Paquete', 10, 'activo'),
(11, '7771234011', 'Bolígrafo BIC Cristal Azul 1.0mm', 'Bolígrafo clásico de escritura suave', 6, 'Unidad', 50, 'activo'),
(12, '7771234012', 'Barra Cereal Quaker Avena y Miel 25g', 'Barra energética nutritiva con miel de abeja', 7, 'Unidad', 24, 'activo')
ON DUPLICATE KEY UPDATE codigo_barras=VALUES(codigo_barras);

-- 5. Inventario por Lotes Inicial (Sucursal 1 Matriz y Sucursal 2)
-- Incluye empaques por caja de 12, 24, 46 y 100 unidades, stock, costos y precios en Bs.
INSERT INTO inventario_lotes 
(id, sucursal_id, producto_id, numero_lote, cajas_compradas, unidades_por_caja, unidades_totales_ingresadas, stock_actual_unidades, costo_caja, costo_unitario, precio_venta_normal, fecha_vencimiento, en_oferta, descuento_porcentaje, precio_venta_oferta, fecha_ingreso, proveedor, estado) 
VALUES
-- Sucursal 1 (Matriz)
(1, 1, 1, 'LOT-SUB-2026-01', 5.00, 24, 120, 115, 72.00, 3.00, 5.00, '2027-06-30', 0, 0.00, NULL, '2026-11-01', 'Distribuidora Arcor Bolivia', 'activo'),
(2, 1, 2, 'LOT-MOG-2026-01', 3.00, 46, 138, 130, 92.00, 2.00, 3.50, '2027-04-15', 1, 14.29, 3.00, '2026-11-05', 'Distribuidora Arcor Bolivia', 'activo'),
(3, 1, 3, 'LOT-BUB-2026-01', 2.00, 100, 200, 190, 40.00, 0.40, 1.00, '2027-12-31', 0, 0.00, NULL, '2026-11-10', 'Mondelez Bolivia', 'activo'),
(4, 1, 4, 'LOT-LAY-2026-01', 10.00, 12, 120, 110, 42.00, 3.50, 5.00, '2027-03-20', 0, 0.00, NULL, '2026-11-12', 'Pepsico Snacks Bolivia', 'activo'),
(5, 1, 6, 'LOT-KOK-2026-01', 15.00, 12, 180, 165, 48.00, 4.00, 6.00, '2027-08-30', 0, 0.00, NULL, '2026-11-15', 'EMBOL S.A.', 'activo'),
-- Sucursal 2
(6, 2, 1, 'LOT-SUB-2026-02', 3.00, 24, 72, 70, 72.00, 3.00, 5.00, '2027-06-30', 0, 0.00, NULL, '2026-11-02', 'Distribuidora Arcor Bolivia', 'activo'),
(7, 2, 6, 'LOT-KOK-2026-02', 8.00, 12, 96, 90, 48.00, 4.00, 6.00, '2027-08-30', 0, 0.00, NULL, '2026-11-16', 'EMBOL S.A.', 'activo')
ON DUPLICATE KEY UPDATE numero_lote=VALUES(numero_lote);

-- 6. Consolidado Sucursal Productos
INSERT INTO sucursal_productos 
(sucursal_id, producto_id, precio_venta_normal, en_oferta, descuento_porcentaje, precio_venta_oferta, stock_total_unidades, stock_minimo_alerta, estado)
VALUES
(1, 1, 5.00, 0, 0.00, NULL, 115, 10, 'activo'),
(1, 2, 3.50, 1, 14.29, 3.00, 130, 15, 'activo'),
(1, 3, 1.00, 0, 0.00, NULL, 190, 25, 'activo'),
(1, 4, 5.00, 0, 0.00, NULL, 110, 10, 'activo'),
(1, 6, 6.00, 0, 0.00, NULL, 165, 12, 'activo'),
(2, 1, 5.00, 0, 0.00, NULL, 70, 10, 'activo'),
(2, 6, 6.00, 0, 0.00, NULL, 90, 12, 'activo')
ON DUPLICATE KEY UPDATE precio_venta_normal=VALUES(precio_venta_normal);

-- --------------------------------------------------------
-- 13. TABLA: configuracion_alertas
-- Configuración de notificaciones automáticas (WhatsApp Gerencia)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion_alertas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    clave VARCHAR(50) NOT NULL UNIQUE,
    telefono VARCHAR(25) NOT NULL DEFAULT '+59170000000',
    activo TINYINT(1) NOT NULL DEFAULT 1,
    hora_envio VARCHAR(10) NOT NULL DEFAULT '08:00',
    apikey_callmebot VARCHAR(100) NULL,
    webhook_url VARCHAR(255) NULL,
    ultimo_envio DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO configuracion_alertas (clave, telefono, activo, hora_envio)
VALUES ('whatsapp_gerencia', '+59170000000', 1, '08:00')
ON DUPLICATE KEY UPDATE clave=clave;

