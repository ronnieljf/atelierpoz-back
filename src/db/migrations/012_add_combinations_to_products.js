/**
 * Migración: Agregar columna combinations a products para stock/precio por combinación (ej. Color × Talla)
 * Ejecutar con: node src/db/migrations/012_add_combinations_to_products.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: combinations en products\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    try {
      const check = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'combinations'
      `);

      if (check.rows.length > 0) {
        console.log('⚠️  La columna combinations ya existe');
        await client.query('COMMIT');
        console.log('\n✅ Migración completada (sin cambios necesarios)');
        return;
      }

      console.log('📝 Agregando columna combinations (JSONB) a products...');
      await client.query(`
        ALTER TABLE products
        ADD COLUMN combinations JSONB DEFAULT '[]'::jsonb
      `);
      console.log('✅ Columna combinations agregada');

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
