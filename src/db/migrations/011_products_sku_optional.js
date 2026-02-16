/**
 * Migración: Hacer el campo sku de products opcional (nullable)
 * Ejecutar con: node src/db/migrations/011_products_sku_optional.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: SKU opcional en products\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    try {
      const check = await client.query(`
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'sku'
      `);

      if (check.rows.length > 0 && check.rows[0].is_nullable === 'YES') {
        console.log('⚠️  La columna sku ya permite NULL');
        await client.query('COMMIT');
        console.log('\n✅ Migración completada (sin cambios necesarios)');
        return;
      }

      console.log('📝 Haciendo sku opcional (nullable) en products...');
      await client.query(`
        ALTER TABLE products
        ALTER COLUMN sku DROP NOT NULL
      `);
      console.log('✅ Columna sku ahora es opcional');

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
