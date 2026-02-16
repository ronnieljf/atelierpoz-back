/**
 * Migración: Crear tabla sales (ventas al contado)
 * Ejecutar con: node src/db/migrations/025_create_sales.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Crear tabla sales\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const check = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'sales'
    `);

    if (check.rows.length > 0) {
      console.log('⚠️  La tabla sales ya existe');
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      CREATE TABLE sales (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        sale_number INTEGER NOT NULL,
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        total DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
        status VARCHAR(50) DEFAULT 'completed' NOT NULL,
        paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_sales_status CHECK (status IN ('completed', 'refunded', 'cancelled'))
      )
    `);
    console.log('✅ Tabla sales creada');

    await client.query(`
      CREATE UNIQUE INDEX idx_sales_store_number ON sales(store_id, sale_number)
    `);
    await client.query(`
      CREATE INDEX idx_sales_store_id ON sales(store_id)
    `);
    await client.query(`
      CREATE INDEX idx_sales_client_id ON sales(client_id)
    `);
    await client.query(`
      CREATE INDEX idx_sales_status ON sales(status)
    `);
    await client.query(`
      CREATE INDEX idx_sales_created_at ON sales(created_at DESC)
    `);
    console.log('✅ Índices creados');

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
