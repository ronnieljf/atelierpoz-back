/**
 * Migración: Opciones de pago guardadas por tienda (PagoMovil, transferencia, Binance).
 * Permite guardar datos de pago para reutilizarlos en recordatorios sin escribir de nuevo.
 *
 * Ejecutar con: node src/db/migrations/059_store_payment_options.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: store_payment_options\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const tableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_payment_options'`
    );

    if (tableCheck.rows.length === 0) {
      await client.query(`
        CREATE TABLE store_payment_options (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          type VARCHAR(20) NOT NULL,
          label VARCHAR(100),
          data TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_store_payment_type CHECK (type IN ('pagomovil', 'transferencia', 'binance'))
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_store_payment_options_store_id ON store_payment_options(store_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_store_payment_options_type ON store_payment_options(store_id, type)`);
      console.log('  ✅ Tabla store_payment_options creada');
    } else {
      console.log('  ⏭️  Tabla store_payment_options ya existe');
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
