/**
 * Migración: Intervalo de repetición de recordatorios y tipo 'repeat'.
 * - users.reminder_interval_days: cada cuántos días repetir el recordatorio (ej. 7)
 * - receivable_reminder_sent y reminder_notifications: permitir reminder_type 'repeat'
 *
 * Ejecutar con: node src/db/migrations/040_reminder_interval_days_and_repeat_type.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: reminder_interval_days y tipo repeat\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const { rows: colExists } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'reminder_interval_days'`
    );
    if (colExists.length === 0) {
      await client.query(
        'ALTER TABLE users ADD COLUMN reminder_interval_days INTEGER NOT NULL DEFAULT 7'
      );
      console.log('  ✅ Columna reminder_interval_days agregada a users');
    } else {
      console.log('  ⏭️  Columna reminder_interval_days ya existe');
    }

    await client.query(`
      ALTER TABLE receivable_reminder_sent DROP CONSTRAINT IF EXISTS chk_reminder_type
    `);
    await client.query(`
      ALTER TABLE receivable_reminder_sent ADD CONSTRAINT chk_reminder_type
      CHECK (reminder_type IN ('after_creation', 'after_last_payment', 'repeat'))
    `);
    console.log('  ✅ Constraint chk_reminder_type actualizado en receivable_reminder_sent');

    await client.query(`
      ALTER TABLE reminder_notifications DROP CONSTRAINT IF EXISTS chk_reminder_notif_type
    `);
    await client.query(`
      ALTER TABLE reminder_notifications ADD CONSTRAINT chk_reminder_notif_type
      CHECK (reminder_type IN ('after_creation', 'after_last_payment', 'repeat'))
    `);
    console.log('  ✅ Constraint chk_reminder_notif_type actualizado en reminder_notifications');

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
