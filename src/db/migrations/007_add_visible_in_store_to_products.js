/**
 * Migración: Agregar columna visible_in_store a la tabla products
 * Ejecutar con: node src/db/migrations/007_add_visible_in_store_to_products.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Agregar visible_in_store a products\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    try {
      // Verificar si la columna ya existe
      const checkColumn = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'visible_in_store'
      `);

      if (checkColumn.rows.length > 0) {
        console.log('⚠️  La columna visible_in_store ya existe en la tabla products');
        await client.query('ROLLBACK');
        return;
      }

      // Agregar la columna visible_in_store
      console.log('📝 Agregando columna visible_in_store a la tabla products...');
      await client.query(`
        ALTER TABLE products
        ADD COLUMN visible_in_store BOOLEAN NOT NULL DEFAULT false
      `);
      console.log('✅ Columna visible_in_store agregada exitosamente\n');

      // Crear índice para mejorar las consultas de filtrado
      console.log('📝 Creando índice para visible_in_store...');
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_products_visible_in_store 
        ON products(visible_in_store) 
        WHERE visible_in_store = true
      `);
      console.log('✅ Índice creado exitosamente\n');

      await client.query('COMMIT');
      console.log('✅ Migración completada exitosamente\n');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  } finally {
    await client.end();
    console.log('📡 Conexión cerrada');
  }
}

// Ejecutar migración
migrate()
  .then(() => {
    console.log('✨ Migración finalizada');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  });
