/**
 * Script para rellenar order_number (pedidos) y receivable_number (cuentas por cobrar)
 * en todos los registros existentes, por tienda y en orden de creación.
 *
 * Si las columnas no existen, las crea y luego asigna los números.
 * Ejecutar desde la raíz del backend: node src/db/scripts/backfill_order_and_receivable_numbers.js
 */

import { createDirectClient } from '../../config/database.js';

async function run() {
  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado\n');

    await client.query('BEGIN');

    try {
      // ─── REQUESTS (pedidos) ───
      const hasOrderNumber = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'requests' AND column_name = 'order_number'
      `);

      if (hasOrderNumber.rows.length === 0) {
        console.log('📝 Añadiendo columna order_number a requests...');
        await client.query(`ALTER TABLE requests ADD COLUMN order_number INTEGER`);
      }

      console.log('📝 Asignando order_number en requests (por tienda, por fecha de creación)...');
      const updRequests = await client.query(`
        WITH numbered AS (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at ASC, id) AS rn
          FROM requests
        )
        UPDATE requests r
        SET order_number = numbered.rn
        FROM numbered
        WHERE r.id = numbered.id
      `);
      console.log(`   → ${updRequests.rowCount ?? 0} filas actualizadas en requests`);

      const notNullOrder = await client.query(`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'requests' AND column_name = 'order_number'
      `);
      if (notNullOrder.rows[0]?.is_nullable === 'YES') {
        await client.query(`ALTER TABLE requests ALTER COLUMN order_number SET NOT NULL`);
        console.log('   → order_number establecido como NOT NULL');
      }
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_store_order_number
        ON requests (store_id, order_number)
      `);
      console.log('✅ Pedidos (requests) listos\n');

      // ─── RECEIVABLES (cuentas por cobrar) ───
      const hasReceivableNumber = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'receivables' AND column_name = 'receivable_number'
      `);

      if (hasReceivableNumber.rows.length === 0) {
        console.log('📝 Añadiendo columna receivable_number a receivables...');
        await client.query(`ALTER TABLE receivables ADD COLUMN receivable_number INTEGER`);
      }

      console.log('📝 Asignando receivable_number en receivables (por tienda, por fecha de creación)...');
      const updReceivables = await client.query(`
        WITH numbered AS (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at ASC, id) AS rn
          FROM receivables
        )
        UPDATE receivables r
        SET receivable_number = numbered.rn
        FROM numbered
        WHERE r.id = numbered.id
      `);
      console.log(`   → ${updReceivables.rowCount ?? 0} filas actualizadas en receivables`);

      const notNullRec = await client.query(`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'receivables' AND column_name = 'receivable_number'
      `);
      if (notNullRec.rows[0]?.is_nullable === 'YES') {
        await client.query(`ALTER TABLE receivables ALTER COLUMN receivable_number SET NOT NULL`);
        console.log('   → receivable_number establecido como NOT NULL');
      }
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_receivables_store_receivable_number
        ON receivables (store_id, receivable_number)
      `);
      console.log('✅ Cuentas por cobrar (receivables) listas\n');

      await client.query('COMMIT');
      console.log('✅ Script completado. Todos los pedidos y cuentas por cobrar tienen número por tienda.');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code) console.error('   Código:', error.code);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Conexión cerrada');
  }
}

run();
