/**
 * Migración: Añadir columna order_number a requests (número de pedido por tienda, incremental).
 * Ejecutar con: node src/db/migrations/019_add_order_number_to_requests.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Añadir order_number a requests\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    try {
      const hasColumn = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'requests' AND column_name = 'order_number'
      `);

      if (hasColumn.rows.length > 0) {
        console.log('⚠️  La columna order_number ya existe en requests');
        await client.query('COMMIT');
        console.log('\n✅ Migración completada (sin cambios necesarios)');
        return;
      }

      console.log('📝 Añadiendo columna order_number...');
      await client.query(`
        ALTER TABLE requests
        ADD COLUMN order_number INTEGER
      `);
      console.log('✅ Columna añadida');

      console.log('📝 Asignando números por tienda (por fecha de creación)...');
      await client.query(`
        WITH numbered AS (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at ASC, id) AS rn
          FROM requests
        )
        UPDATE requests r
        SET order_number = numbered.rn
        FROM numbered
        WHERE r.id = numbered.id
      `);
      console.log('✅ Valores asignados');

      console.log('📝 Estableciendo NOT NULL y constraint único...');
      await client.query(`
        ALTER TABLE requests
        ALTER COLUMN order_number SET NOT NULL
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_store_order_number
        ON requests (store_id, order_number)
      `);
      console.log('✅ Constraint único (store_id, order_number) creado');

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
