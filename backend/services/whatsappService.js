const { pool } = require('../config/db');
const https = require('https');
const http = require('http');

class WhatsappService {
  /**
   * Normalizar teléfono para Bolivia (+591...)
   */
  normalizarTelefono(telefono) {
    if (!telefono) return null;
    let telLimpio = String(telefono).replace(/[^\d+]/g, '');
    if (!telLimpio || telLimpio.replace('+', '').length < 7) return null;

    if (!telLimpio.startsWith('+')) {
      if (telLimpio.startsWith('591') && telLimpio.length >= 10) {
        telLimpio = '+' + telLimpio;
      } else {
        telLimpio = '+591' + telLimpio;
      }
    }
    return telLimpio;
  }

  /**
   * Obtener configuración actual de alertas de WhatsApp
   */
  async getConfig() {
    const [rows] = await pool.query(
      `SELECT id, clave, telefono, activo, hora_envio, apikey_callmebot, webhook_url, ultimo_envio, updated_at
       FROM configuracion_alertas
       WHERE clave = 'whatsapp_gerencia'
       LIMIT 1`
    );

    if (rows.length === 0) {
      return {
        clave: 'whatsapp_gerencia',
        telefono: '+59170612345',
        activo: 1,
        hora_envio: '08:00',
        apikey_callmebot: null,
        webhook_url: null,
        ultimo_envio: null
      };
    }

    return rows[0];
  }

  /**
   * Actualizar configuración de WhatsApp
   */
  async updateConfig(datos) {
    const { telefono, activo, hora_envio, apikey_callmebot, webhook_url } = datos;
    const telLimpio = this.normalizarTelefono(telefono) || '+59170612345';

    await pool.query(
      `INSERT INTO configuracion_alertas (clave, telefono, activo, hora_envio, apikey_callmebot, webhook_url)
       VALUES ('whatsapp_gerencia', ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         telefono = VALUES(telefono),
         activo = VALUES(activo),
         hora_envio = VALUES(hora_envio),
         apikey_callmebot = VALUES(apikey_callmebot),
         webhook_url = VALUES(webhook_url),
         updated_at = CURRENT_TIMESTAMP`,
      [
        telLimpio,
        activo ? 1 : 0,
        hora_envio || '08:00',
        apikey_callmebot || null,
        webhook_url || null
      ]
    );

    return await this.getConfig();
  }

  /**
   * Obtener usuarios activos con teléfono WhatsApp registrado
   */
  async getDestinatariosActivos() {
    const [users] = await pool.query(
      `SELECT u.id, u.nombre, u.rol, u.sucursal_id, u.telefono,
              COALESCE(s.nombre, 'Todas las Tiendas') AS sucursal_nombre
       FROM usuarios u
       LEFT JOIN sucursales s ON u.sucursal_id = s.id
       WHERE u.estado = 'activo'
         AND u.telefono IS NOT NULL
         AND TRIM(u.telefono) != ''`
    );

    const admins = [];
    const cajeros = [];

    for (const u of users) {
      const telNorm = this.normalizarTelefono(u.telefono);
      if (!telNorm) continue;
      const item = { ...u, telefonoNormalizado: telNorm };
      if (u.rol === 'admin') {
        admins.push(item);
      } else if (u.rol === 'vendedor' && u.sucursal_id) {
        cajeros.push(item);
      }
    }

    return { admins, cajeros };
  }

  /**
   * Consultar lotes por vencer en ambas tiendas (<= 14 días o vencidos)
   */
  async getLotesPorVencerAmbasSucursales() {
    const query = `
      SELECT il.id, il.sucursal_id, s.nombre AS sucursal_nombre, s.codigo AS sucursal_codigo,
             p.nombre AS producto_nombre, p.codigo_barras, p.unidad_medida,
             il.numero_lote, il.stock_actual_unidades, il.costo_unitario, il.precio_venta_normal,
             il.en_oferta, il.descuento_porcentaje, il.precio_venta_oferta, il.fecha_vencimiento,
             DATEDIFF(il.fecha_vencimiento, CURDATE()) AS dias_restantes
      FROM inventario_lotes il
      JOIN productos p ON il.producto_id = p.id
      JOIN sucursales s ON il.sucursal_id = s.id
      WHERE il.stock_actual_unidades > 0
        AND il.estado = 'activo'
        AND DATEDIFF(il.fecha_vencimiento, CURDATE()) <= 14
      ORDER BY il.sucursal_id ASC, dias_restantes ASC
    `;

    const [rows] = await pool.query(query);
    return rows;
  }

  /**
   * Mensaje consolidado para el Administrador (ambas sucursales + novedades críticas)
   */
  generarMensajeAdmin(lotes) {
    const fechaHoy = new Date().toLocaleDateString('es-BO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    if (lotes.length === 0) {
      return `*CANDY BOOM - REPORTE DIARIO DE VENCIMIENTOS*\nFecha: ${fechaHoy}\n\nSin novedades críticas: No existen productos vencidos ni próximos a vencer en los siguientes 14 días en Sucursal 1 Matriz ni Sucursal 2.`;
    }

    const vencidos = lotes.filter(l => l.dias_restantes <= 0);
    const criticos = lotes.filter(l => l.dias_restantes > 0 && l.dias_restantes <= 14);

    const porSucursal = {};
    for (const lot of lotes) {
      const sucNombre = lot.sucursal_nombre || `Sucursal ${lot.sucursal_id}`;
      if (!porSucursal[sucNombre]) porSucursal[sucNombre] = [];
      porSucursal[sucNombre].push(lot);
    }

    let msg = `*ALERTA CONSOLIDADA DE VENCIMIENTOS - CANDY BOOM*\n`;
    msg += `Fecha: ${fechaHoy}\n`;
    if (vencidos.length > 0) {
      msg += `*NOVEDAD CRÍTICA:* ${vencidos.length} lote(s) VENCIDO(S) requieren retiro inmediato.\n`;
    }
    msg += `Resumen: ${criticos.length} lote(s) a <= 14 días de vencer en ambas tiendas:\n\n`;

    for (const [sucursal, items] of Object.entries(porSucursal)) {
      msg += `*${sucursal.toUpperCase()}* (${items.length}):\n`;
      items.forEach((item, index) => {
        let estadoStr = '';
        if (item.dias_restantes <= 0) {
          estadoStr = `VENCIDO (${Math.abs(item.dias_restantes)} días atrás) - RETIRAR`;
        } else if (item.dias_restantes === 1) {
          estadoStr = `Vence MAÑANA`;
        } else {
          estadoStr = `Vence en ${item.dias_restantes} días (${new Date(item.fecha_vencimiento).toLocaleDateString('es-BO')})`;
        }

        const ofertaBadge = item.en_oferta ? ` [En Oferta: Bs. ${Number(item.precio_venta_oferta).toFixed(2)}]` : '';
        msg += `  ${index + 1}. *${item.producto_nombre}*\n`;
        msg += `     • Lote: ${item.numero_lote} | Stock: *${item.stock_actual_unidades} ${item.unidad_medida}*\n`;
        msg += `     • Estado: ${estadoStr}${ofertaBadge}\n`;
      });
      msg += `\n`;
    }

    msg += `Acción sugerida: Aplicar rebaja/oferta o coordinar rotación prioritaria con los cajeros.\n`;
    msg += `_Candy Boom · Sucre, Bolivia_`;
    return msg;
  }

  /**
   * Mensaje personalizado para cada Cajero activo (solo su sucursal asignada)
   */
  generarMensajeCajero(cajero, lotesSucursal) {
    const fechaHoy = new Date().toLocaleDateString('es-BO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    if (lotesSucursal.length === 0) {
      return `*CANDY BOOM - ${cajero.sucursal_nombre}*\nHola ${cajero.nombre} (${fechaHoy}):\nNo tienes productos vencidos ni por vencer en los próximos 14 días en tu tienda. ¡Buen turno!`;
    }

    let msg = `*CANDY BOOM - PRIORIDAD EN VITRINA (${cajero.sucursal_nombre})*\n`;
    msg += `Hola *${cajero.nombre}* (${fechaHoy}),\n`;
    msg += `Por favor revisa estos *${lotesSucursal.length} producto(s)* de tu sucursal y *ponlos adelante en vitrina* para venderlos primero antes de que caduquen:\n\n`;

    lotesSucursal.forEach((item, index) => {
      let estadoStr = '';
      if (item.dias_restantes <= 0) {
        estadoStr = `VENCIDO - RETIRAR INMEDIATAMENTE`;
      } else if (item.dias_restantes === 1) {
        estadoStr = `Vence MAÑANA (Prioridad máxima)`;
      } else {
        estadoStr = `Vence en ${item.dias_restantes} días (${new Date(item.fecha_vencimiento).toLocaleDateString('es-BO')})`;
      }

      const precioMostrar = item.en_oferta
        ? `OFERTA: Bs. ${Number(item.precio_venta_oferta).toFixed(2)}`
        : `Precio: Bs. ${Number(item.precio_venta_normal).toFixed(2)}`;

      msg += `${index + 1}. *${item.producto_nombre}*\n`;
      msg += `   • Stock: ${item.stock_actual_unidades} ${item.unidad_medida} | Lote: ${item.numero_lote}\n`;
      msg += `   • ${estadoStr} | ${precioMostrar}\n`;
    });

    msg += `\nRecuerda despachar siempre primero estos lotes en caja.`;
    return msg;
  }

  /**
   * Despachar un mensaje individual vía CallMeBot o Webhook si están configurados
   */
  async despacharPorCanal(telefonoNormalizado, mensaje, config, meta = {}) {
    const telefonoSinMas = telefonoNormalizado.replace(/[^\d]/g, '');
    const whatsappUrl = `https://wa.me/${telefonoSinMas}?text=${encodeURIComponent(mensaje)}`;
    let canal = 'Enlace directo WhatsApp';
    let enviadoApi = false;

    if (config.apikey_callmebot && telefonoSinMas) {
      try {
        const callMeBotUrl = `https://api.callmebot.com/whatsapp.php?phone=+${telefonoSinMas}&text=${encodeURIComponent(mensaje)}&apikey=${config.apikey_callmebot}`;
        await this.hacerPeticionHttp(callMeBotUrl);
        canal = 'CallMeBot API automatizado';
        enviadoApi = true;
      } catch (e) {
        console.warn(`[WhatsApp CallMeBot -> ${telefonoNormalizado}] Error:`, e.message);
      }
    }

    if (config.webhook_url) {
      try {
        await this.dispararWebhook(config.webhook_url, {
          telefono: telefonoNormalizado,
          mensaje,
          ...meta,
          fecha: new Date().toISOString()
        });
        canal = 'Webhook externo';
        enviadoApi = true;
      } catch (e) {
        console.warn(`[WhatsApp Webhook -> ${telefonoNormalizado}] Error:`, e.message);
      }
    }

    return { whatsappUrl, canal, enviadoApi };
  }

  /**
   * Ejecutar envío de notificación WhatsApp a Administradores y Cajeros activos
   */
  async enviarNotificacion(manual = false) {
    const config = await this.getConfig();
    const lotes = await this.getLotesPorVencerAmbasSucursales();
    const { admins, cajeros } = await this.getDestinatariosActivos();

    // 1. Mensaje consolidado para Administrador(es)
    const mensajeAdmin = this.generarMensajeAdmin(lotes);
    const enviosAdmins = [];

    // Si hay admins con teléfono en tabla usuarios, notificar a cada uno; sino usar config.telefono
    const listaAdmins = admins.length > 0
      ? admins
      : [{ id: 0, nombre: 'Gerencia Candy Boom', telefonoNormalizado: this.normalizarTelefono(config.telefono) || '+59170612345' }];

    for (const adm of listaAdmins) {
      const resDespacho = await this.despacharPorCanal(adm.telefonoNormalizado, mensajeAdmin, config, {
        rol: 'admin',
        nombre: adm.nombre,
        totalLotes: lotes.length
      });
      enviosAdmins.push({
        usuario_id: adm.id,
        nombre: adm.nombre,
        telefono: adm.telefonoNormalizado,
        whatsappUrl: resDespacho.whatsappUrl,
        canal: resDespacho.canal,
        enviadoApi: resDespacho.enviadoApi
      });
    }

    // 2. Mensajes personalizados para cada Cajero activo (solo lotes de SU sucursal)
    const enviosCajeros = [];
    for (const caj of cajeros) {
      const lotesSucursal = lotes.filter(l => parseInt(l.sucursal_id, 10) === parseInt(caj.sucursal_id, 10));
      // En modo automático diario, si no tiene lotes próximos a vencer en su tienda se omite spam; en manual o con lotes se genera
      if (!manual && lotesSucursal.length === 0) continue;

      const mensajeCajero = this.generarMensajeCajero(caj, lotesSucursal);
      const resDespacho = await this.despacharPorCanal(caj.telefonoNormalizado, mensajeCajero, config, {
        rol: 'vendedor',
        nombre: caj.nombre,
        sucursal_id: caj.sucursal_id,
        sucursal_nombre: caj.sucursal_nombre,
        totalLotesSucursal: lotesSucursal.length
      });

      enviosCajeros.push({
        usuario_id: caj.id,
        nombre: caj.nombre,
        sucursal_id: caj.sucursal_id,
        sucursal_nombre: caj.sucursal_nombre,
        telefono: caj.telefonoNormalizado,
        totalLotesSucursal: lotesSucursal.length,
        mensajeTexto: mensajeCajero,
        whatsappUrl: resDespacho.whatsappUrl,
        canal: resDespacho.canal,
        enviadoApi: resDespacho.enviadoApi
      });
    }

    await pool.query(
      `UPDATE configuracion_alertas SET ultimo_envio = NOW() WHERE clave = 'whatsapp_gerencia'`
    );

    const adminPrincipal = enviosAdmins[0];

    return {
      success: true,
      mensajeTexto: mensajeAdmin,
      canal: adminPrincipal?.canal || 'Enlace directo WhatsApp',
      telefono: adminPrincipal?.telefono || config.telefono,
      whatsappUrl: adminPrincipal?.whatsappUrl || '',
      totalLotes: lotes.length,
      lotes,
      enviosAdmins,
      enviosCajeros,
      fechaEnvio: new Date().toISOString()
    };
  }

  hacerPeticionHttp(urlStr) {
    return new Promise((resolve, reject) => {
      https.get(urlStr, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  dispararWebhook(urlStr, payload) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const postData = JSON.stringify(payload);
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = client.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
}

module.exports = new WhatsappService();
