/**
 * Migración: Crear tabla receivable_payments (abonos de cuentas por cobrar)
 * Permite registrar abonos parciales; cuando la suma de abonos >= monto de la cuenta,
 * la cuenta se marca como cobrada.
 * Ejecutar con: node src/db/migrations/014_receivable_payments.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Crear tabla receivable_payments (abonos)\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    try {
      const check = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = 'receivable_payments'
      `);

      if (check.rows.length > 0) {
        console.log('⚠️  La tabla receivable_payments ya existe');
        await client.query('COMMIT');
        console.log('\n✅ Migración completada (sin cambios necesarios)');
        return;
      }

      console.log('📝 Creando tabla receivable_payments...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS receivable_payments (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          receivable_id UUID NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
          amount DECIMAL(10, 2) NOT NULL,
          currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          CONSTRAINT chk_receivable_payments_amount CHECK (amount > 0)
        )
      `);
      console.log('✅ Tabla receivable_payments creada');

      console.log('📝 Creando índices...');
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivable_payments_receivable_id ON receivable_payments(receivable_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivable_payments_created_at ON receivable_payments(created_at DESC)`);
      console.log('✅ Índices creados');

      await client.query('COMMIT');
      console.log('\n✅ Migración completada exitosamente!');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('\n❌ Error en la migración:', error.message);
    if (error.code) console.error(`   Código: ${error.code}`);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Conexión cerrada');
  }
}

migrate();
