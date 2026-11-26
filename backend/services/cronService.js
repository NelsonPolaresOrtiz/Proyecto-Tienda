const cron = require('node-cron');
const whatsappService = require('./whatsappService');

class CronService {
  constructor() {
    this.jobs = [];
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;

    console.log('[Cron] Inicializando tareas programadas de Candy Boom...');

    // Tarea diaria a las 08:00 AM para revisión y alerta de vencimientos a Gerencia
    const dailyJob = cron.schedule('0 8 * * *', async () => {
      try {
        console.log('[Cron 08:00 AM] Verificando vencimientos en ambas sucursales...');
        const config = await whatsappService.getConfig();
        if (config.activo) {
          const resultado = await whatsappService.enviarNotificacion(false);
          console.log(`[Cron WhatsApp] Alerta consolidada enviada a ${resultado.enviosAdmins?.length || 1} admin(s) y ${resultado.enviosCajeros?.length || 0} cajero(s) (${resultado.totalLotes} lotes <= 14 días).`);
        } else {
          console.log('[Cron WhatsApp] Alerta diaria desactivada en configuración.');
        }
      } catch (error) {
        console.error('[Cron WhatsApp Error]:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'America/La_Paz'
    });

    this.jobs.push(dailyJob);
    this.initialized = true;
    console.log('[Cron] Tarea diaria de alerta de vencimientos programada (08:00 AM - America/La_Paz)');
  }
}

module.exports = new CronService();
