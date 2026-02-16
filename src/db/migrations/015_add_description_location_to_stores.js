/**
 * Migración: Agregar campos description y location (TEXT) a la tabla stores
 * Ejecutar con: node src/db/migrations/015_add_description_location_to_stores.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Agregar description y location a stores\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    try {
      const checkDesc = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'stores' AND column_name = 'description'
      `);
      const checkLoc = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'stores' AND column_name = 'location'
      `);

      if (checkDesc.rows.length > 0 && checkLoc.rows.length > 0) {
        console.log('⚠️  Las columnas description y location ya existen en stores');
        await client.query('COMMIT');
        console.log('\n✅ Migración completada (sin cambios necesarios)');
        return;
      }

      if (checkDesc.rows.length === 0) {
        console.log('📝 Agregando columna description a stores...');
        await client.query(`
          ALTER TABLE stores
          ADD COLUMN description TEXT
        `);
        console.log('✅ Columna description agregada');
      }

      if (checkLoc.rows.length === 0) {
        console.log('📝 Agregando columna location a stores...');
        await client.query(`
          ALTER TABLE stores
          ADD COLUMN location TEXT
        `);
        console.log('✅ Columna location agregada');
      }

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
