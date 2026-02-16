/**
 * Migración: Crear tabla receivables (cuentas por cobrar)
 * Permite crear cuentas por cobrar manuales o a partir de un pedido (request).
 * Ejecutar con: node src/db/migrations/013_create_receivables.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Crear tabla receivables (cuentas por cobrar)\n');

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
        WHERE table_name = 'receivables'
      `);

      if (check.rows.length > 0) {
        console.log('⚠️  La tabla receivables ya existe');
        await client.query('COMMIT');
        console.log('\n✅ Migración completada (sin cambios necesarios)');
        return;
      }

      console.log('📝 Creando tabla receivables...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS receivables (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          customer_name VARCHAR(255),
          customer_phone VARCHAR(50),
          description TEXT,
          amount DECIMAL(10, 2) NOT NULL,
          currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
          status VARCHAR(50) DEFAULT 'pending' NOT NULL,
          request_id UUID REFERENCES requests(id) ON DELETE SET NULL,
          paid_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_receivables_status CHECK (status IN ('pending', 'paid', 'cancelled'))
        )
      `);
      console.log('✅ Tabla receivables creada');

      console.log('📝 Creando índices...');
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivables_store_id ON receivables(store_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivables_created_by ON receivables(created_by)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivables_status ON receivables(status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivables_created_at ON receivables(created_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivables_request_id ON receivables(request_id)`);
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
