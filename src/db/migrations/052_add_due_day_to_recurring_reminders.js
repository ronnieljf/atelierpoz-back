/**
 * Migración 052: Agregar columna due_day a client_recurring_reminders.
 * Indica el día del mes en que vence el pago (1-31).
 *
 * Ejecutar con: node src/db/migrations/052_add_due_day_to_recurring_reminders.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: agregar due_day a recordatorios recurrentes\n');

  const dbClient = createDirectClient();

  try {
    await dbClient.connect();
    await dbClient.query('BEGIN');

    const hasDueDay = await dbClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'client_recurring_reminders' AND column_name = 'due_day'
    `);
    if (hasDueDay.rows.length === 0) {
      await dbClient.query(`
        ALTER TABLE client_recurring_reminders
        ADD COLUMN due_day INTEGER CHECK (due_day >= 1 AND due_day <= 31)
      `);
      console.log('  ✅ Columna due_day agregada');
    } else {
      console.log('  ⏭️  Columna due_day ya existe');
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
