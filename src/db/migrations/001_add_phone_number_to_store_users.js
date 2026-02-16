/**
 * Migración: Agregar campo phone_number a la tabla store_users
 * Ejecutar con: node src/db/migrations/001_add_phone_number_to_store_users.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Agregar phone_number a store_users\n');

  const client = createDirectClient();

  try {
    // Conectar al cliente directo
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    // Iniciar transacción
    await client.query('BEGIN');

    try {
      // Verificar si la columna ya existe
      const checkColumnResult = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'store_users' 
        AND column_name = 'phone_number'
      `);

      if (checkColumnResult.rows.length > 0) {
        console.log('⚠️  La columna phone_number ya existe en store_users');
        await client.query('COMMIT');
        console.log('\n✅ Migración completada (sin cambios necesarios)');
        return;
      }

      // Agregar la columna phone_number
      console.log('📝 Agregando columna phone_number a store_users...');
      await client.query(`
        ALTER TABLE store_users 
        ADD COLUMN phone_number VARCHAR(20)
      `);
      console.log('✅ Columna phone_number agregada exitosamente');

      // Commit de la transacción
      await client.query('COMMIT');
      console.log('\n✅ Migración completada exitosamente!');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('\n❌ Error en la migración:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
    if (error.position) {
      console.error(`   Posición: ${error.position}`);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Conexión cerrada');
  }
}

migrate();
