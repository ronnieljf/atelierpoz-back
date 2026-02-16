/**
 * Migración: Agregar sort_order a products para que las tiendas puedan ordenar sus productos.
 * Menor número = aparece primero. NULL = sin orden (se muestran al final por updated_at).
 * Ejecutar con: node src/db/migrations/017_add_sort_order_to_products.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Agregar sort_order a products\n');

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
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'sort_order'
      `);

      if (hasColumn.rows.length > 0) {
        console.log('⚠️  La columna sort_order ya existe en products');
        await client.query('COMMIT');
        console.log('\n✅ Migración completada (sin cambios necesarios)');
        return;
      }

      console.log('📝 Agregando columna sort_order (INTEGER NULL)...');
      await client.query(`
        ALTER TABLE products
        ADD COLUMN sort_order INTEGER NULL
      `);
      console.log('✅ Columna sort_order agregada');

      console.log('📝 Creando índice para ordenar por tienda...');
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_products_store_sort ON products(store_id, sort_order NULLS LAST)
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
