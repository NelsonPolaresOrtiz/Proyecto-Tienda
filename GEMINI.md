# Candy Boom — Reglas de Negocio, UI/UX y Arquitectura Full-Stack

Este archivo define las reglas obligatorias y siempre activas del proyecto **Candy Boom (POS y Gestión Multi-Sucursal - Sucre, Bolivia)**, integradas con las skills instaladas en `.agent/skills/` (`.agents/skills/`).

---

## 1. Skills Activas del Proyecto

Antes de crear o modificar código, aplica los lineamientos de las skills instaladas:

- **Diseño UI/UX Frontend**:
  - `frontend-design` (`.agent/skills/frontend-design/SKILL.md`): Diseño intencional, limpio, sin plantillas genéricas ni estética artificial.
  - `web-design-guidelines` (`.agent/skills/web-design-guidelines/SKILL.md`): Accesibilidad, contraste, foco, formularios y auditoría UX.
  - `tailwind-design-system` (`.agent/skills/tailwind-design-system/SKILL.md`): Tokens CSS-first con `@theme` en Tailwind CSS v4 y patrones responsivos.
- **Desarrollo Full-Stack**:
  - `angular-developer` (`.agent/skills/angular-developer/SKILL.md`): Componentes standalone, Angular Signals, `computed`, Reactive Forms y verificación con `ng build`.
  - `nodejs-backend-patterns` (`.agent/skills/nodejs-backend-patterns/SKILL.md`): Arquitectura Express en capas (routes -> controllers -> services), manejo de errores y seguridad JWT.
  - `mysql` (`.agent/skills/mysql/SKILL.md`): Integridad transaccional InnoDB, bloqueos `FOR UPDATE`, índices adecuados y codificación `utf8mb4`.

---

## 2. Identidad Visual Oficial de Candy Boom

- **Paleta de Colores Obligatoria**:
  - **Azul Marino Profundo (`#0F172A`)**: Barra lateral (Sidebar), pantallas de bienvenida/transición y fondo de Login.
  - **Naranja Mandarina (`#F97316`, hover `#EA580C`)**: Acciones primarias, botones principales de guardar/cobrar e indicador de módulo activo.
  - **Verde Esmeralda (`#10B981`)**: Ganancias, utilidades, ingresos, estado activo/caja abierta y confirmaciones positivas.
  - **Rojo / Carmesí (`#DC2626` / `#E11D48`)**: Vencidos, egresos/salidas de dinero y alertas críticas.
  - **Fondo General (`#F4F6F9`)** y **Tarjetas (`#FFFFFF` con borde `#E2E8F0`)**.
- **Cero Emojis en Toda la Interfaz**:
  - Está prohibido incluir emojis en menús, cabeceras, tarjetas, botones, tablas o alertas.
  - Usar exclusivamente **iconos vectoriales SVG minimalistas estilo Lucide Icons** (`stroke-width="1.75"`, `fill="none"`, `stroke="currentColor"`).

---

## 3. Lenguaje Comercial en Español de Bolivia

- **Cero jerga técnica en pantalla**: Nunca mostrar términos de desarrollo al usuario final (ej. prohibido usar *"Signals"*, *"Reactivo"*, *"Fórmula de Costeo"*, *"Control Atómico"*, *"Aislamiento Estricto"*, *"FOR UPDATE"* o textos explicativos de relleno).
- **Moneda y Ubicación**:
  - Moneda oficial: **Bolivianos (`Bs.`)**.
  - Ubicación oficial: **Sucre, Chuquisaca, Bolivia** (`SUC-01` Casa Matriz en Calle Nicolás Ortiz #45 y `SUC-02` Sucursal 2 en Av. Hernando Siles #820).
- **Títulos Estándar**: *Panel Principal*, *Tiendas y Sucursales*, *Personal y Cajeros*, *Auditoría*, *Inventario*, *Registro de Compras*, *Control de Vencimientos*, *Traspasos entre Tiendas*, *Punto de Venta*, *Ingresos y Egresos*, *Arqueo de Caja*, *Reportes* y *Mi Perfil*.

---

## 4. Reglas de Negocio y Seguridad (MySQL + Node.js)

1. **Aislamiento Estricto por `sucursal_id`**:
   - Los cajeros (`rol = 'vendedor'`) solo pueden consultar y operar en su sucursal asignada (`branchGuard` en Express + bloqueo de selector en Angular en POS, Compras, Vencimientos, Ingresos/Egresos y Arqueo).
   - El Administrador (`rol = 'admin'`) tiene acceso global y filtro consolidado o por tienda.
2. **Descuento FIFO por Vencimiento**:
   - Toda venta en POS descuenta stock del lote activo más próximo a vencer (`ORDER BY fecha_vencimiento ASC, id ASC`) dentro de transacciones MySQL con `FOR UPDATE`.
3. **Auditoría Total Obligatoria**:
   - Toda operación crítica (login, logout, ventas, compras, ofertas/precios, movimientos de caja, traspasos, arqueos, usuarios, sucursales y perfil) debe registrarse con `registrarAuditoria(usuario_id, sucursal_id, modulo, accion, detalle, req)` en `auditoria_actividades`.
4. **Alertas Automáticas por WhatsApp**:
   - Las notificaciones matutinas (`node-cron` 08:00 AM) y manuales utilizan el campo `telefono` de `usuarios` activos (`+591...`), enviando reporte consolidado al Administrador y avisos personalizados por tienda a cada Cajero.
