const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  charset: 'utf8mb4'
};

const pool = mysql.createPool(dbConfig);

// Helper para verificar conexión
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(`[MySQL] Conexión establecida con éxito en ${dbConfig.host}:${dbConfig.port} (${dbConfig.database})`);
    connection.release();
    return true;
  } catch (error) {
    console.error(`[MySQL Error] No se pudo conectar a la base de datos:`, error.message);
    return false;
  }
}

module.exports = {
  pool,
  testConnection,
  dbConfig
};
