/**
 * Migración para crear la tabla de posts
 * Ejecutar con: npm run migrate
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración de posts...\n');

  const client = createDirectClient();

  try {
    // Conectar al cliente directo
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    // Crear tabla de posts
    console.log('📝 Creando tabla posts...\n');

    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        hashtags TEXT[], -- Array de hashtags
        images TEXT[], -- Array de URLs de imágenes
        selected_products UUID[], -- Array de IDs de productos
        platform VARCHAR(20) NOT NULL DEFAULT 'instagram' CHECK (platform IN ('instagram')),
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled')),
        scheduled_at TIMESTAMP,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Tabla posts creada exitosamente\n');

    // Crear índices
    console.log('📝 Creando índices...\n');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_store_id ON posts(store_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC)
    `);

    console.log('✅ Índices creados exitosamente\n');

    // Crear trigger para actualizar updated_at
    console.log('📝 Creando trigger para updated_at...\n');

    await client.query(`
      CREATE OR REPLACE FUNCTION update_posts_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_posts_updated_at ON posts;
      CREATE TRIGGER trigger_update_posts_updated_at
      BEFORE UPDATE ON posts
      FOR EACH ROW
      EXECUTE FUNCTION update_posts_updated_at();
    `);

    console.log('✅ Trigger creado exitosamente\n');

    console.log('✅ Migración de posts completada exitosamente!');
    console.log('\n📊 Tabla creada:');
    console.log('   - posts');
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
