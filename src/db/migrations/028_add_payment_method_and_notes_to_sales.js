/**
 * Migración: Agregar payment_method y notes a sales (ventas al contado)
 * Ejecutar con: node src/db/migrations/028_add_payment_method_and_notes_to_sales.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Agregar payment_method y notes a sales\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const check = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sales' AND column_name = 'payment_method'
    `);

    if (check.rows.length > 0) {
      console.log('⚠️  Las columnas ya existen');
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      ALTER TABLE sales
        ADD COLUMN payment_method VARCHAR(100),
        ADD COLUMN notes TEXT
    `);
    console.log('✅ Columnas payment_method y notes agregadas');

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
