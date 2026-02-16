/**
 * Migración: Agregar updated_by a sales y receivables; crear tablas sales_logs y receivables_logs
 * para trazabilidad de quién crea/actualiza cada registro.
 * Ejecutar con: node src/db/migrations/030_sales_receivables_updated_by_and_logs.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: updated_by y tablas de logs\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    // 1. sales.updated_by
    const salesCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sales' AND column_name = 'updated_by'
    `);
    if (salesCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE sales ADD COLUMN updated_by UUID REFERENCES users(id) ON DELETE SET NULL
      `);
      console.log('✅ Columna sales.updated_by agregada');
    } else {
      console.log('⚠️  sales.updated_by ya existe');
    }

    // 2. receivables.updated_by
    const recCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'receivables' AND column_name = 'updated_by'
    `);
    if (recCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE receivables ADD COLUMN updated_by UUID REFERENCES users(id) ON DELETE SET NULL
      `);
      console.log('✅ Columna receivables.updated_by agregada');
    } else {
      console.log('⚠️  receivables.updated_by ya existe');
    }

    // 3. Tabla sales_logs
    const salesLogsTable = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'sales_logs'
    `);
    if (salesLogsTable.rows.length === 0) {
      await client.query(`
        CREATE TABLE sales_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          action VARCHAR(80) NOT NULL,
          details JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`CREATE INDEX idx_sales_logs_sale_id ON sales_logs(sale_id)`);
      await client.query(`CREATE INDEX idx_sales_logs_created_at ON sales_logs(created_at DESC)`);
      console.log('✅ Tabla sales_logs creada');
    } else {
      console.log('⚠️  Tabla sales_logs ya existe');
    }

    // 4. Tabla receivables_logs
    const recLogsTable = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'receivables_logs'
    `);
    if (recLogsTable.rows.length === 0) {
      await client.query(`
        CREATE TABLE receivables_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          receivable_id UUID NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          action VARCHAR(80) NOT NULL,
          details JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`CREATE INDEX idx_receivables_logs_receivable_id ON receivables_logs(receivable_id)`);
      await client.query(`CREATE INDEX idx_receivables_logs_created_at ON receivables_logs(created_at DESC)`);
      console.log('✅ Tabla receivables_logs creada');
    } else {
      console.log('⚠️  Tabla receivables_logs ya existe');
    }

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
