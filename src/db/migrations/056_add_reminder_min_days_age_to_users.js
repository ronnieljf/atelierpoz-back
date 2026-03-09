/**
 * Migración: Agregar campo reminder_min_days_age a la tabla users.
 * Define cuántos días de antigüedad debe tener una cuenta por cobrar
 * para incluirla en el reporte automático.
 *
 * Ejecutar con: node src/db/migrations/056_add_reminder_min_days_age_to_users.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: reminder_min_days_age en users\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const col = {
      name: 'reminder_min_days_age',
      sql: 'ALTER TABLE users ADD COLUMN reminder_min_days_age INTEGER NOT NULL DEFAULT 30',
    };

    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = $1`,
      [col.name]
    );

    if (rows.length > 0) {
      console.log(`  ⏭️  Columna ${col.name} ya existe, saltando...`);
    } else {
      await client.query(col.sql);
      console.log(`  ✅ Columna ${col.name} agregada a users`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Migración completada exitosamente');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en migración:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

migrate().catch(() => process.exit(1));

