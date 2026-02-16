/**
 * Migración: Agregar store_id (nullable) a la tabla categories.
 * Referencia a la tienda; NULL = categoría global.
 * Ejecutar con: node src/db/migrations/016_add_store_id_to_categories.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Agregar store_id a categories\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    try {
      const hasColumn = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'store_id'
      `);

      if (hasColumn.rows.length > 0) {
        console.log('⚠️  La columna store_id ya existe en categories');
        await client.query('COMMIT');
        console.log('\n✅ Migración completada (sin cambios necesarios)');
        return;
      }

      console.log('📝 Agregando columna store_id (UUID NULL, FK a stores)...');
      await client.query(`
        ALTER TABLE categories
        ADD COLUMN store_id UUID NULL REFERENCES stores(id) ON DELETE SET NULL
      `);
      console.log('✅ Columna store_id agregada');

      console.log('📝 Creando índice idx_categories_store_id...');
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_categories_store_id ON categories(store_id)
      `);
      console.log('✅ Índice creado');

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
