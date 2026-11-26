const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function initDatabase() {
  console.log('------------------------------------------------------------');
  console.log('🚀 Iniciando configuración de Base de Datos Candy Boom POS...');
  console.log('------------------------------------------------------------');

  const connectionConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    multipleStatements: true,
    charset: 'utf8mb4'
  };

  let connection;
  try {
    connection = await mysql.createConnection(connectionConfig);
    console.log(`[1/3] Conectado al servidor MySQL en ${connectionConfig.host}:${connectionConfig.port}`);

    const dbName = process.env.DB_NAME || 'candy_boom_db';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.query(`USE \`${dbName}\`;`);
    console.log(`[2/3] Base de datos seleccionada: \`${dbName}\``);

    // Leer y ejecutar schema.sql completo con precargas
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await connection.query(schemaSql);
    console.log('[3/3] Tablas, relaciones y precargas maestras creadas con éxito.');

    console.log('------------------------------------------------------------');
    console.log('🎉 ¡Base de datos Candy Boom inicializada correctamente!');
    console.log('------------------------------------------------------------');
    console.log('Usuarios disponibles para pruebas:');
    console.log('  - Administrador Global: admin@candyboom.bo / Admin123*');
    console.log('  - Cajero Matriz (Suc. 1): vendedor1@candyboom.bo / Ventas123*');
    console.log('  - Cajera Sucursal 2: vendedor2@candyboom.bo / Ventas123*');
    console.log('------------------------------------------------------------');

  } catch (error) {
    console.error('❌ Error al inicializar la base de datos:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  initDatabase();
}

module.exports = initDatabase;
