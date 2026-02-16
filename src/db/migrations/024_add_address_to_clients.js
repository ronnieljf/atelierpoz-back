/**
 * Migración: Agregar columna address a clients
 * Ejecutar con: node src/db/migrations/024_add_address_to_clients.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Agregar address a clients\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const check = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'clients' AND column_name = 'address'
    `);

    if (check.rows.length > 0) {
      console.log('⚠️  La columna address ya existe');
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      ALTER TABLE clients ADD COLUMN address TEXT
    `);
    console.log('✅ Columna address agregada');

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
