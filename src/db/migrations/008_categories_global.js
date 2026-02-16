/**
 * Migración: Categorías globales (quitar store_id y created_by)
 * Ejecutar con: node src/db/migrations/008_categories_global.js
 *
 * La tabla categories queda: id, name, slug (y created_at/updated_at si se desean mantener).
 * Si existen slugs duplicados entre tiendas, la migración fallará al agregar UNIQUE(slug);
 * en ese caso hay que consolidar categorías manualmente antes de ejecutar.
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Categorías globales (quitar store_id, created_by)\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    try {
      // Nombre del constraint UNIQUE(store_id, slug)
      const constraintResult = await client.query(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'categories'::regclass AND contype = 'u'
      `);

      if (constraintResult.rows.length > 0) {
        const constraintName = constraintResult.rows[0].conname;
        console.log('📝 Eliminando constraint único (store_id, slug):', constraintName);
        await client.query(`ALTER TABLE categories DROP CONSTRAINT IF EXISTS "${constraintName}"`);
      }

      // Eliminar índices que referencian las columnas a eliminar
      console.log('📝 Eliminando índices en store_id y created_by...');
      await client.query('DROP INDEX IF EXISTS idx_categories_store_id');
      await client.query('DROP INDEX IF EXISTS idx_categories_created_by');

      // Eliminar columnas
      console.log('📝 Eliminando columna store_id...');
      await client.query('ALTER TABLE categories DROP COLUMN IF EXISTS store_id');
      console.log('📝 Eliminando columna created_by...');
      await client.query('ALTER TABLE categories DROP COLUMN IF EXISTS created_by');

      // Slug único global
      console.log('📝 Agregando constraint UNIQUE(slug)...');
      await client.query(`
        ALTER TABLE categories
        ADD CONSTRAINT categories_slug_key UNIQUE (slug)
      `);

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
