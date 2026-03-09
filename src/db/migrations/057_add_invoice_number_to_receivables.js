/**
 * Migración: Agregar campo invoice_number a receivables.
 * Usado para guardar el número de factura asociado a la cuenta por cobrar.
 *
 * Ejecutar con: node src/db/migrations/057_add_invoice_number_to_receivables.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: invoice_number en receivables\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const columnName = 'invoice_number';
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'receivables' AND column_name = $1`,
      [columnName]
    );

    if (rows.length > 0) {
      console.log(`  ⏭️  Columna ${columnName} ya existe, saltando...`);
    } else {
      await client.query(`ALTER TABLE receivables ADD COLUMN invoice_number VARCHAR(100)`);
      console.log(`  ✅ Columna ${columnName} agregada a receivables`);
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

