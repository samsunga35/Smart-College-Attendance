// db.js - MySQL Database Connection Configuration
const mysql = require('mysql2');

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'attendance_db',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3360,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Export promise-based pool for clean async/await queries
module.exports = pool.promise();
