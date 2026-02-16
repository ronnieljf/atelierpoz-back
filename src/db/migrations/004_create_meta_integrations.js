/**
 * Migración para crear la tabla de integraciones de Meta/Instagram
 * Ejecutar con: npm run migrate:meta
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración de integraciones Meta...\n');

  const client = createDirectClient();

  try {
    // Conectar al cliente directo
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    // Crear tabla de integraciones Meta
    console.log('📝 Creando tabla meta_integrations...\n');

    await client.query(`
      CREATE TABLE IF NOT EXISTS meta_integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        page_id VARCHAR(255),
        page_name VARCHAR(255),
        instagram_account_id VARCHAR(255),
        instagram_username VARCHAR(255),
        access_token TEXT NOT NULL,
        token_type VARCHAR(50) DEFAULT 'bearer',
        expires_at TIMESTAMP,
        is_long_lived BOOLEAN DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, page_id)
      )
    `);

    console.log('✅ Tabla meta_integrations creada exitosamente\n');

    // Crear índices
    console.log('📝 Creando índices...\n');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meta_integrations_user_id ON meta_integrations(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meta_integrations_instagram_account_id ON meta_integrations(instagram_account_id)
    `);

    console.log('✅ Índices creados exitosamente\n');

    // Crear trigger para actualizar updated_at
    console.log('📝 Creando trigger para updated_at...\n');

    await client.query(`
      CREATE OR REPLACE FUNCTION update_meta_integrations_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_meta_integrations_updated_at ON meta_integrations;
      CREATE TRIGGER trigger_update_meta_integrations_updated_at
      BEFORE UPDATE ON meta_integrations
      FOR EACH ROW
      EXECUTE FUNCTION update_meta_integrations_updated_at();
    `);

    console.log('✅ Trigger creado exitosamente\n');

    console.log('✅ Migración de integraciones Meta completada exitosamente!');
    console.log('\n📊 Tabla creada:');
    console.log('   - meta_integrations');
  } catch (error) {
    console.error('\n❌ Error en la migración:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
    if (error.position) {
      console.error(`   Posición: ${error.position}`);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Conexión cerrada');
  }
}

migrate();
