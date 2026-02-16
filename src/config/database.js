/**
 * Configuración de la base de datos PostgreSQL (Neon)
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool, Client } = pg;

// Crear pool de conexiones (para operaciones normales)
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Requerido para Neon PostgreSQL
  },
  max: 20, // Máximo de conexiones en el pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Aumentado a 10 segundos
  statement_timeout: 30000, // Timeout para queries
});

// Probar la conexión
pool.on('connect', () => {
  console.log('✅ Conectado a PostgreSQL (Neon)');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err);
  // No hacer exit inmediato, solo loguear
});

// Función helper para ejecutar queries
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Query ejecutada', { text: text.substring(0, 100), duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Error en query:', { text: text.substring(0, 100), error: error.message });
    throw error;
  }
}

// Función para obtener un cliente del pool
export async function getClient() {
  const client = await pool.connect();
  return client;
}

// Función para crear un cliente directo (sin pool) - útil para migraciones
export function createDirectClient() {
  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  
  return new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
    connectionTimeoutMillis: 30000, // 30 segundos para migraciones
    statement_timeout: 60000, // 60 segundos para queries largas
  });
}
