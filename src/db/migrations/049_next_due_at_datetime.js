/**
 * Migración 049: next_due_date → next_due_at (TIMESTAMPTZ).
 * El recordatorio se envía a una fecha y hora específica (YYYY-MM-DD HH:MM).
 *
 * Ejecutar con: node src/db/migrations/049_next_due_at_datetime.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: next_due_date a next_due_at (fecha y hora)\n');

  const dbClient = createDirectClient();

  try {
    await dbClient.connect();
    await dbClient.query('BEGIN');

    const hasNextDueDate = await dbClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'client_recurring_reminders' AND column_name = 'next_due_date'
    `);

    if (hasNextDueDate.rows.length > 0) {
      await dbClient.query(`ALTER TABLE client_recurring_reminders ADD COLUMN next_due_at TIMESTAMPTZ`);
      await dbClient.query(`
        UPDATE client_recurring_reminders
        SET next_due_at = (next_due_date::text || ' 00:00:00')::timestamptz
      `);
      await dbClient.query(`ALTER TABLE client_recurring_reminders ALTER COLUMN next_due_at SET NOT NULL`);
      await dbClient.query(`DROP INDEX IF EXISTS idx_client_recurring_reminders_next_due`);
      await dbClient.query(`ALTER TABLE client_recurring_reminders DROP COLUMN next_due_date`);
      await dbClient.query(`CREATE INDEX idx_client_recurring_reminders_next_due_at ON client_recurring_reminders(next_due_at)`);
      console.log('  ✅ Columna next_due_date reemplazada por next_due_at (TIMESTAMPTZ)');
    } else {
      const hasNextDueAt = await dbClient.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'client_recurring_reminders' AND column_name = 'next_due_at'
      `);
      if (hasNextDueAt.rows.length === 0) {
        await dbClient.query(`ALTER TABLE client_recurring_reminders ADD COLUMN next_due_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
        await dbClient.query(`CREATE INDEX IF NOT EXISTS idx_client_recurring_reminders_next_due_at ON client_recurring_reminders(next_due_at)`);
        console.log('  ✅ Columna next_due_at agregada');
      } else {
        console.log('  ⏭️  Columna next_due_at ya existe');
      }
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
