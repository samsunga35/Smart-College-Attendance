// db.js - MySQL Database Connection Configuration
const mysql = require('mysql2');

// Build database configuration supporting both local and cloud environments
let poolConfig;

if (process.env.DATABASE_URL || process.env.MYSQL_URL) {
  const uri = process.env.DATABASE_URL || process.env.MYSQL_URL;
  poolConfig = {
    uri: uri,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false }
  };
} else {
  const host = process.env.DB_HOST || process.env.MYSQLHOST || 'localhost';
  const isRemote = host !== 'localhost' && host !== '127.0.0.1';
  const needSSL = process.env.DB_SSL === 'true' || (isRemote && process.env.DB_SSL !== 'false');

  poolConfig = {
    host: host,
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'attendance_db',
    port: process.env.DB_PORT
      ? parseInt(process.env.DB_PORT)
      : process.env.MYSQLPORT
        ? parseInt(process.env.MYSQLPORT)
        : 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: needSSL ? { rejectUnauthorized: false } : undefined
  };
}

console.log(`[DB] Target Host: ${poolConfig.host || 'URI'}, Port: ${poolConfig.port || 'default'}, Database: ${poolConfig.database || 'default'}, SSL: ${!!poolConfig.ssl}`);

// Create MySQL connection pool
const pool = mysql.createPool(poolConfig);
const promisePool = pool.promise();

// Test connection on startup
promisePool.query('SELECT 1')
  .then(() => console.log('✅ [DB] Database connection established successfully!'))
  .catch(err => console.error('❌ [DB] Connection failed:', err.message));

// Export promise-based pool for clean async/await queries
module.exports = promisePool;
