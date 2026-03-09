/**
 * Migración 063: Campos de interés por mora en receivable_reminders.
 * Cada recordatorio de tipo mora puede tener su propia config (cada X días, tipo, monto).
 *
 * Ejecutar con: node src/db/migrations/063_add_interest_to_receivable_reminders.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración 063: interés en receivable_reminders\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'receivable_reminders'
    `);
    const existing = new Set(cols.rows.map((r) => r.column_name));

    if (!existing.has('interest_cada_dias')) {
      await client.query(`
        ALTER TABLE receivable_reminders ADD COLUMN interest_cada_dias INTEGER
      `);
      console.log('  ✅ Columna interest_cada_dias agregada');
    } else {
      console.log('  ⏭️  interest_cada_dias ya existe');
    }

    if (!existing.has('interest_tipo')) {
      await client.query(`
        ALTER TABLE receivable_reminders ADD COLUMN interest_tipo VARCHAR(20)
      `);
      console.log('  ✅ Columna interest_tipo agregada');
    } else {
      console.log('  ⏭️  interest_tipo ya existe');
    }

    if (!existing.has('interest_monto')) {
      await client.query(`
        ALTER TABLE receivable_reminders ADD COLUMN interest_monto DECIMAL(12, 4)
      `);
      console.log('  ✅ Columna interest_monto agregada');
    } else {
      console.log('  ⏭️  interest_monto ya existe');
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
