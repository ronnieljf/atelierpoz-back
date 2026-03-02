/**
 * Migración 050: Quitar interval_days y days_before_due.
 * El recordatorio se envía exactamente en la fecha y hora (next_due_at).
 *
 * Ejecutar con: node src/db/migrations/050_remove_interval_days_before.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: quitar interval_days y days_before_due\n');

  const dbClient = createDirectClient();

  try {
    await dbClient.connect();
    await dbClient.query('BEGIN');

    const hasInterval = await dbClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'client_recurring_reminders' AND column_name = 'interval_days'
    `);
    if (hasInterval.rows.length > 0) {
      await dbClient.query(`ALTER TABLE client_recurring_reminders DROP COLUMN interval_days`);
      console.log('  ✅ Columna interval_days eliminada');
    }

    const hasDaysBefore = await dbClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'client_recurring_reminders' AND column_name = 'days_before_due'
    `);
    if (hasDaysBefore.rows.length > 0) {
      await dbClient.query(`ALTER TABLE client_recurring_reminders DROP COLUMN days_before_due`);
      console.log('  ✅ Columna days_before_due eliminada');
    }

    await dbClient.query('COMMIT');
    console.log('\n✅ Migración completada exitosamente');
  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('❌ Error en migración:', error.message);
    throw error;
  } finally {
    await dbClient.end();
  }
}

migrate().catch(() => process.exit(1));
