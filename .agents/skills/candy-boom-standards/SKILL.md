---
name: candy-boom-standards
description: >-
  Combina las skills de diseño UI/UX y desarrollo Full-Stack con las reglas comerciales,
  paleta oficial (#0F172A y #F97316), iconografía Lucide SVG, español de Bolivia (Bs.)
  y arquitectura multi-sucursal de Candy Boom. Usar en cualquier nueva pantalla o endpoint.
---

# Estándares Full-Stack y UI/UX de Candy Boom

Aplica esta guía junto a `frontend-design`, `web-design-guidelines`, `tailwind-design-system`, `angular-developer`, `nodejs-backend-patterns` y `mysql`.

## 1. Reglas Visuales Frontend (Angular + Tailwind v4)

- **Paleta**:
  - Fondo de pantalla: `#F4F6F9`
  - Sidebar y Telones: `#0F172A`
  - Primario / Acción: `#F97316` (hover `#EA580C`)
  - Éxito / Ingresos: `#10B981`
  - Tarjetas: `#FFFFFF` con borde `border-slate-200` (`#E2E8F0`)
- **Iconos y Textos**:
  - Prohibidos los emojis en plantillas HTML y mensajes visibles al usuario.
  - Usar SVG vectoriales minimalistas (`stroke-width="1.75"`, estilo Lucide).
  - Textos comerciales naturales en español de Bolivia (moneda `Bs.`, ciudad `Sucre`).
- **Angular Moderno**:
  - Componentes `standalone: true` con `signal()` y `computed()`.
  - Validar siempre con `npm run build --prefix frontend`.

## 2. Reglas Backend y Base de Datos (Node.js + MySQL)

- **Base de Datos (`candy_boom_db`)**:
  - Pool `mysql2/promise` desde `backend/config/db.js`.
  - Operaciones de stock, ventas, traspasos y compras siempre dentro de `connection.beginTransaction()` con bloqueos `FOR UPDATE`.
- **Seguridad y Auditoría**:
  - Respetar aislamiento por `sucursal_id` para `rol === 'vendedor'`.
  - Llamar siempre a `registrarAuditoria(usuario_id, sucursal_id, modulo, accion, detalle, req)` en `backend/utils/auditoriaHelper.js`.
