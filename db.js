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
  poolConfig = {
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
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
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  };
}

// Create MySQL connection pool
const pool = mysql.createPool(poolConfig);

// Export promise-based pool for clean async/await queries
module.exports = pool.promise();
