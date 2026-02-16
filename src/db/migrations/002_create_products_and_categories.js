/**
 * Migración: Crear tablas products y categories
 * Ejecutar con: node src/db/migrations/002_create_products_and_categories.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Crear tablas products y categories\n');

  const client = createDirectClient();

  try {
    // Conectar al cliente directo
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    // Iniciar transacción
    await client.query('BEGIN');

    try {
      // Statements SQL para crear las tablas
      const statements = [
        // Tabla de categorías
        `CREATE TABLE IF NOT EXISTS categories (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(100) NOT NULL,
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(store_id, slug)
        )`,
        
        // Índices para categories
        `CREATE INDEX IF NOT EXISTS idx_categories_store_id ON categories(store_id)`,
        `CREATE INDEX IF NOT EXISTS idx_categories_created_by ON categories(created_by)`,
        `CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)`,
        
        // Tabla de productos
        `CREATE TABLE IF NOT EXISTS products (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          base_price DECIMAL(10, 2) NOT NULL,
          currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
          stock INTEGER DEFAULT 0 NOT NULL,
          sku VARCHAR(100) NOT NULL,
          category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          images JSONB DEFAULT '[]'::jsonb,
          attributes JSONB DEFAULT '[]'::jsonb,
          rating DECIMAL(3, 2),
          review_count INTEGER DEFAULT 0,
          tags JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(store_id, sku)
        )`,
        
        // Índices para products
        `CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id)`,
        `CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)`,
        `CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by)`,
        `CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`,
        `CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)`,
        `CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN(tags)`,
      ];

      console.log(`📋 Ejecutando ${statements.length} statements...\n`);

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement) {
          try {
            await client.query(statement);
            // Mostrar preview del statement
            const firstLine = statement.split('\n').find(l => l.trim().length > 0) || '';
            const preview = firstLine.substring(0, 70).trim();
            console.log(`✅ [${i + 1}/${statements.length}] ${preview}...`);
          } catch (error) {
            // Si es un error de "already exists", continuar
            if (error.code === '42P07' || error.message.includes('already exists')) {
              const firstLine = statement.split('\n').find(l => l.trim().length > 0) || '';
              const preview = firstLine.substring(0, 70).trim();
              console.log(`⚠️  [${i + 1}/${statements.length}] ${preview}... (ya existe)`);
            } else {
              // Para otros errores, mostrar más detalles y hacer rollback
              console.error(`\n❌ Error en statement ${i + 1}:`);
              const firstLine = statement.split('\n').find(l => l.trim().length > 0) || '';
              console.error(`   Statement: ${firstLine.substring(0, 100)}...`);
              console.error(`   Error: ${error.message}`);
              console.error(`   Código: ${error.code}`);
              if (error.position) {
                console.error(`   Posición: ${error.position}`);
              }
              await client.query('ROLLBACK');
              throw error;
            }
          }
        }
      }
      
      await client.query('COMMIT');
      console.log('\n✅ Transacción completada exitosamente');
      console.log('\n✅ Migración completada exitosamente!');
      console.log('\n📊 Tablas creadas:');
      console.log('   - categories');
      console.log('   - products');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
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
