import 'dotenv/config';
import mysql from 'mysql2/promise';

// Pool compartido para las consultas.
export const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER ,
  password: process.env.DB_PASSWORD ,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "-05:00",
});

// Comprueba la conexión al cargar este archivo.
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('Conexión a MySQL establecida correctamente');
    conn.release();
  } catch (error) {
    console.error('Error al conectar con MySQL:', error.message);
  }
})();