/**
 * Migración: Agregar campos de recordatorios a la tabla users.
 * - reminders_enabled: si el usuario puede ver el módulo de recordatorios
 * - reminder_days_after_creation: días después de crear la cuenta por cobrar para recordar (ej. 30)
 * - reminder_days_after_last_payment: días después del último abono para recordar (ej. 15)
 *
 * Ejecutar con: node src/db/migrations/038_add_reminders_to_users.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: recordatorios en users\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const columns = [
      { name: 'reminders_enabled', sql: 'ALTER TABLE users ADD COLUMN reminders_enabled BOOLEAN NOT NULL DEFAULT false' },
      { name: 'reminder_days_after_creation', sql: 'ALTER TABLE users ADD COLUMN reminder_days_after_creation INTEGER NOT NULL DEFAULT 30' },
      { name: 'reminder_days_after_last_payment', sql: 'ALTER TABLE users ADD COLUMN reminder_days_after_last_payment INTEGER NOT NULL DEFAULT 15' },
    ];

    for (const col of columns) {
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
