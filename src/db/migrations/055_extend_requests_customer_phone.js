/**
 * Migración: Extender customer_phone en requests de VARCHAR(20) a VARCHAR(50)
 * para permitir números más largos (ej. internacionales).
 * Ejecutar con: node src/db/migrations/055_extend_requests_customer_phone.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: extender customer_phone en requests\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const col = await client.query(`
      SELECT character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'requests' AND column_name = 'customer_phone'
    `);

    if (col.rows.length === 0) {
      console.log('⚠️  Columna customer_phone no encontrada');
      await client.query('COMMIT');
      return;
    }

    const maxLen = col.rows[0].character_maximum_length;
    if (maxLen && parseInt(maxLen, 10) >= 50) {
      console.log('⚠️  customer_phone ya tiene longitud >= 50');
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      ALTER TABLE requests ALTER COLUMN customer_phone TYPE VARCHAR(50)
    `);
    console.log('✅ customer_phone extendido a VARCHAR(50)');

    await client.query('COMMIT');
    console.log('\n✅ Migración completada');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
