/**
 * Migración: Agregar columna identity_document (cédula de identidad) a clients
 * Ejecutar con: node src/db/migrations/029_add_identity_document_to_clients.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Agregar identity_document a clients\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const check = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'clients' AND column_name = 'identity_document'
    `);

    if (check.rows.length > 0) {
      console.log('⚠️  La columna identity_document ya existe');
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      ALTER TABLE clients ADD COLUMN identity_document VARCHAR(50)
    `);
    console.log('✅ Columna identity_document agregada');

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
