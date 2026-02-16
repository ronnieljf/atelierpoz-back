/**
 * Migración: Agregar columna hide_price a la tabla products
 * Ejecutar con: node src/db/migrations/021_add_hide_price_to_products.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Agregar hide_price a products\n');

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
        AND column_name = 'hide_price'
      `);

      if (checkColumn.rows.length > 0) {
        console.log('⚠️  La columna hide_price ya existe en la tabla products');
        await client.query('ROLLBACK');
        return;
      }

      // Agregar la columna hide_price
      console.log('📝 Agregando columna hide_price a la tabla products...');
      await client.query(`
        ALTER TABLE products
        ADD COLUMN hide_price BOOLEAN NOT NULL DEFAULT false
      `);
      console.log('✅ Columna hide_price agregada exitosamente\n');

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
