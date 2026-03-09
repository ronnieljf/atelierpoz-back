/**
 * Migración 061: Agregar campo tipo_recordatorio a receivable_reminders.
 * Valores: 'aviso' (solo para avisar) | 'mora' (recordatorio por mora).
 *
 * Ejecutar con: node src/db/migrations/061_add_tipo_recordatorio_to_receivable_reminders.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración 061: tipo_recordatorio en receivable_reminders\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'receivable_reminders' AND column_name = 'tipo_recordatorio'
    `);

    if (rows.length > 0) {
      console.log('  ⏭️  Columna tipo_recordatorio ya existe');
    } else {
      await client.query(`
        ALTER TABLE receivable_reminders
        ADD COLUMN tipo_recordatorio VARCHAR(20) NOT NULL DEFAULT 'aviso'
        CONSTRAINT chk_tipo_recordatorio CHECK (tipo_recordatorio IN ('aviso', 'mora'))
      `);
      console.log('  ✅ Columna tipo_recordatorio agregada');

      // Migrar datos existentes: es_mora = true -> tipo_recordatorio = 'mora'
      await client.query(`
        UPDATE receivable_reminders SET tipo_recordatorio = 'mora' WHERE es_mora = true
      `);
      const updated = await client.query(`SELECT 1 FROM receivable_reminders WHERE es_mora = true`);
      if (updated.rowCount > 0) {
        console.log(`  ✅ ${updated.rowCount} registros migrados a tipo_recordatorio = 'mora'`);
      }
    }

    await client.query('COMMIT');
    console.log('\n✅ Migración 061 completada');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

migrate().catch(() => process.exit(1));
