/**
 * Migración: Crear tabla clients (cartera de clientes por tienda)
 * Campos: name, phone, email (opcionales), store_id (requerido)
 * Un cliente por teléfono por tienda: UNIQUE(store_id, phone) cuando phone no es null
 * Ejecutar con: node src/db/migrations/018_create_clients.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Crear tabla clients\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    try {
      const check = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'clients'
      `);

      if (check.rows.length > 0) {
        console.log('⚠️  La tabla clients ya existe');
        await client.query('COMMIT');
        console.log('\n✅ Migración completada (sin cambios necesarios)');
        return;
      }

      console.log('📝 Creando tabla clients...');
      await client.query(`
        CREATE TABLE clients (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name TEXT,
          phone VARCHAR(50),
          email VARCHAR(255),
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Tabla clients creada');

      console.log('📝 Creando índices...');
      await client.query(`
        CREATE INDEX idx_clients_store_id ON clients(store_id)
      `);
      await client.query(`
        CREATE INDEX idx_clients_phone ON clients(phone)
      `);
      await client.query(`
        CREATE UNIQUE INDEX idx_clients_store_phone ON clients(store_id, phone)
        WHERE phone IS NOT NULL
      `);
      console.log('✅ Índices creados');

      await client.query('COMMIT');
      console.log('\n✅ Migración completada exitosamente!');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('\n❌ Error en la migración:', error.message);
    if (error.code) console.error('   Código:', error.code);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Conexión cerrada');
  }
}

migrate();
