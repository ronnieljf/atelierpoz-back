/**
 * Migración: Añadir columna receivable_number a receivables (número de cuenta por cobrar por tienda, incremental).
 * Ejecutar con: node src/db/migrations/020_add_receivable_number_to_receivables.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Añadir receivable_number a receivables\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    try {
      const hasColumn = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'receivables' AND column_name = 'receivable_number'
      `);

      if (hasColumn.rows.length > 0) {
        console.log('⚠️  La columna receivable_number ya existe en receivables');
        await client.query('COMMIT');
        console.log('\n✅ Migración completada (sin cambios necesarios)');
        return;
      }

      console.log('📝 Añadiendo columna receivable_number...');
      await client.query(`
        ALTER TABLE receivables
        ADD COLUMN receivable_number INTEGER
      `);
      console.log('✅ Columna añadida');

      console.log('📝 Asignando números por tienda (por fecha de creación)...');
      await client.query(`
        WITH numbered AS (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at ASC, id) AS rn
          FROM receivables
        )
        UPDATE receivables r
        SET receivable_number = numbered.rn
        FROM numbered
        WHERE r.id = numbered.id
      `);
      console.log('✅ Valores asignados');

      console.log('📝 Estableciendo NOT NULL y constraint único...');
      await client.query(`
        ALTER TABLE receivables
        ALTER COLUMN receivable_number SET NOT NULL
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_receivables_store_receivable_number
        ON receivables (store_id, receivable_number)
      `);
      console.log('✅ Constraint único (store_id, receivable_number) creado');

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
