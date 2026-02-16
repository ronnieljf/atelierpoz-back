/**
 * Migración: Crear tabla requests para guardar pedidos de clientes
 * Ejecutar con: node src/db/migrations/006_create_requests.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Crear tabla requests\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    try {
      // Verificar si la tabla ya existe
      const check = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = 'requests'
      `);

      if (check.rows.length > 0) {
        console.log('⚠️  La tabla requests ya existe');
        await client.query('COMMIT');
        console.log('\n✅ Migración completada (sin cambios necesarios)');
        return;
      }

      console.log('📝 Creando tabla requests...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS requests (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          customer_name VARCHAR(255),
          customer_phone VARCHAR(20),
          customer_email VARCHAR(255),
          items JSONB NOT NULL DEFAULT '[]'::jsonb,
          custom_message TEXT,
          status VARCHAR(50) DEFAULT 'pending' NOT NULL,
          total DECIMAL(10, 2) NOT NULL DEFAULT 0,
          currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Tabla requests creada exitosamente');

      // Crear índices
      console.log('📝 Creando índices...');
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_requests_store_id ON requests(store_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_requests_customer_phone ON requests(customer_phone)
      `);
      console.log('✅ Índices creados exitosamente');

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
