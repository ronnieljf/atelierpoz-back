/**
 * Migración 044: Campo approved en stores.
 * Por defecto false; solo las tiendas con approved = true son visibles en la web pública.
 *
 * Ejecutar con: node src/db/migrations/044_add_approved_to_stores.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: add_approved_to_stores\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false
    `);
    console.log('  ✅ Columna stores.approved creada');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stores_approved ON stores(approved)
    `);

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
