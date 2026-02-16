/**
 * Migración: Slug único por tienda (store_id, slug).
 * Permite el mismo slug en distintas tiendas; solo falla si se duplica dentro de la misma tienda.
 * Ejecutar con: node src/db/migrations/022_categories_unique_store_slug.js
 *
 * - Si existe UNIQUE(slug), se elimina.
 * - Se crea UNIQUE(store_id, slug).
 * - Si la tabla no tiene store_id (por migración 008), se agrega store_id nullable.
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Slug único por tienda (store_id, slug)\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    try {
      // 1. Asegurar que store_id existe
      const hasStoreId = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'store_id'
      `);
      if (hasStoreId.rows.length === 0) {
        console.log('📝 Agregando columna store_id (nullable)...');
        await client.query(`
          ALTER TABLE categories
          ADD COLUMN store_id UUID NULL REFERENCES stores(id) ON DELETE SET NULL
        `);
        await client.query('CREATE INDEX IF NOT EXISTS idx_categories_store_id ON categories(store_id)');
        console.log('✅ Columna store_id agregada');
      } else {
        console.log('⚠️  Columna store_id ya existe');
      }

      // 2. Eliminar constraint UNIQUE(slug) si existe
      const constraints = await client.query(`
        SELECT conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conrelid = 'public.categories'::regclass AND contype = 'u'
      `);
      for (const row of constraints.rows) {
        if (row.def && row.def.includes('(slug)') && !row.def.includes('store_id')) {
          console.log('📝 Eliminando constraint único solo en slug:', row.conname);
          await client.query(`ALTER TABLE categories DROP CONSTRAINT IF EXISTS "${row.conname}"`);
        }
      }
      // Por nombre conocido (008)
      await client.query('ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_slug_key');

      // 3. Crear UNIQUE(store_id, slug)
      console.log('📝 Creando índice único (store_id, slug)...');
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS categories_store_id_slug_key
        ON categories (store_id, slug)
      `);
      console.log('✅ Índice único (store_id, slug) creado');

      await client.query('COMMIT');
      console.log('\n✅ Migración completada exitosamente');
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
