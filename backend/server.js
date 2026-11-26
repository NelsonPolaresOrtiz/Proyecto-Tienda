const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { testConnection, pool } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const sucursalRoutes = require('./routes/sucursalRoutes');
const posRoutes = require('./routes/posRoutes');
const userRoutes = require('./routes/userRoutes');
const inventarioRoutes = require('./routes/inventarioRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reporteRoutes = require('./routes/reporteRoutes');
const auditoriaRoutes = require('./routes/auditoriaRoutes');
const cronService = require('./services/cronService');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de CORS para desarrollo local y dominio de producción en Firebase / Render
const envOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((url) => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:3000',
  ...envOrigins
];

app.use(cors({
  origin: (origin, callback) => {
    const normalizedOrigin = origin ? origin.replace(/\/+$/, '') : origin;
    // Permitir solicitudes sin origen (Postman, curl, health checks) o en la lista blanca
    if (!normalizedOrigin || allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    return callback(new Error('Bloqueado por política CORS de Candy Boom'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-sucursal-id']
}));

// Middlewares estándar
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Endpoint de Salud / Verificación para Render y monitoreo de base de datos
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({
      status: 'ok',
      db: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      db: 'disconnected',
      error: error.message
    });
  }
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/sucursales', sucursalRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/usuarios', userRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reportes', reporteRoutes);
app.use('/api/auditoria', auditoriaRoutes);

// Manejador 404 para rutas no encontradas (Compatible con Express 5)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Recurso no encontrado: ${req.method} ${req.originalUrl}`
  });
});

// Middleware Global de Errores
app.use(errorHandler);

// Iniciar servidor verificando base de datos
async function startServer() {
  console.log('------------------------------------------------------------');
  console.log('🍭 Candy Boom POS - Servidor Backend API (Bolivia)');
  console.log('------------------------------------------------------------');

  await testConnection();
  cronService.init();

  app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en: http://localhost:${PORT}`);
    console.log(`📡 Endpoints disponibles bajo /api/*`);
    console.log(`🔐 Autenticación: POST http://localhost:${PORT}/api/auth/login`);
    console.log('------------------------------------------------------------');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
