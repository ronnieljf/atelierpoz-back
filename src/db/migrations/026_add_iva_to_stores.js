/**
 * Migración: Agregar columna iva (porcentaje) a stores
 * Ejecutar con: node src/db/migrations/026_add_iva_to_stores.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Agregar iva a stores\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const check = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'stores' AND column_name = 'iva'
    `);

    if (check.rows.length > 0) {
      console.log('⚠️  La columna iva ya existe');
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      ALTER TABLE stores ADD COLUMN iva DECIMAL(5, 2) DEFAULT 0 NOT NULL
    `);
    console.log('✅ Columna iva agregada');

    await client.query('COMMIT');
    console.log('\n✅ Migración completada');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
