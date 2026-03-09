/**
 * Migración 060: Campos adicionales en receivable_reminders para mora y repetición.
 *
 * - es_mora BOOLEAN NOT NULL DEFAULT false
 * - repetir_veces INTEGER NOT NULL DEFAULT 0
 * - repetir_cada_dias INTEGER NOT NULL DEFAULT 0
 *
 * Ejecutar con: node src/db/migrations/060_receivable_reminders_mora_repeat.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración 060: receivable_reminders mora y repetición\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    await client.query('BEGIN');

    console.log('🔎 Verificando columnas existentes en receivable_reminders...');
    const { rows } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'receivable_reminders'
    `);
    const existing = new Set(rows.map((r) => r.column_name));

    if (!existing.has('es_mora')) {
      console.log('➕ Añadiendo columna es_mora...');
      await client.query(`ALTER TABLE receivable_reminders ADD COLUMN es_mora BOOLEAN NOT NULL DEFAULT false`);
    } else {
      console.log('⏭️  Columna es_mora ya existe');
    }

    if (!existing.has('repetir_veces')) {
      console.log('➕ Añadiendo columna repetir_veces...');
      await client.query(`ALTER TABLE receivable_reminders ADD COLUMN repetir_veces INTEGER NOT NULL DEFAULT 0`);
    } else {
      console.log('⏭️  Columna repetir_veces ya existe');
    }

    if (!existing.has('repetir_cada_dias')) {
      console.log('➕ Añadiendo columna repetir_cada_dias...');
      await client.query(`ALTER TABLE receivable_reminders ADD COLUMN repetir_cada_dias INTEGER NOT NULL DEFAULT 0`);
    } else {
      console.log('⏭️  Columna repetir_cada_dias ya existe');
    }

    await client.query('COMMIT');
    console.log('\n✅ Migración 060 completada exitosamente');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en migración 060:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

migrate().catch(() => process.exit(1));

