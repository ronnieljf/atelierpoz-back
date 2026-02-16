/**
 * Migración: Agregar campo tiktok (usuario) a la tabla stores
 * Ejecutar con: node src/db/migrations/009_add_tiktok_to_stores.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Agregar tiktok a stores\n');

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
        WHERE table_name = 'stores' AND column_name = 'tiktok'
      `);

      if (check.rows.length > 0) {
        console.log('⚠️  La columna tiktok ya existe en stores');
        await client.query('COMMIT');
        console.log('\n✅ Migración completada (sin cambios necesarios)');
        return;
      }

      console.log('📝 Agregando columna tiktok a stores...');
      await client.query(`
        ALTER TABLE stores
        ADD COLUMN tiktok VARCHAR(255)
      `);
      console.log('✅ Columna tiktok agregada exitosamente');

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
