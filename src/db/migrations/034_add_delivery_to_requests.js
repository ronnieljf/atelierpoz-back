/**
 * Migración: Agregar campos de delivery a requests.
 * delivery_method: 'pickup' | 'delivery'
 * delivery_address, delivery_reference, delivery_recipient_name,
 * delivery_recipient_phone, delivery_date, delivery_notes
 *
 * Ejecutar con: node src/db/migrations/034_add_delivery_to_requests.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Delivery fields en requests\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const cols = [
      { name: 'delivery_method', sql: `ALTER TABLE requests ADD COLUMN delivery_method VARCHAR(20) DEFAULT 'pickup' NOT NULL` },
      { name: 'delivery_address', sql: `ALTER TABLE requests ADD COLUMN delivery_address TEXT` },
      { name: 'delivery_reference', sql: `ALTER TABLE requests ADD COLUMN delivery_reference TEXT` },
      { name: 'delivery_recipient_name', sql: `ALTER TABLE requests ADD COLUMN delivery_recipient_name VARCHAR(255)` },
      { name: 'delivery_recipient_phone', sql: `ALTER TABLE requests ADD COLUMN delivery_recipient_phone VARCHAR(50)` },
      { name: 'delivery_date', sql: `ALTER TABLE requests ADD COLUMN delivery_date TIMESTAMPTZ` },
      { name: 'delivery_notes', sql: `ALTER TABLE requests ADD COLUMN delivery_notes TEXT` },
    ];

    for (const col of cols) {
      const check = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'requests' AND column_name = $1`,
        [col.name]
      );
      if (check.rows.length === 0) {
        console.log(`📝 Añadiendo ${col.name}...`);
        await client.query(col.sql);
        console.log(`✅ ${col.name} añadido`);
      } else {
        console.log(`⚠️  ${col.name} ya existe`);
      }
    }

    await client.query('COMMIT');
    console.log('\n✅ Migración completada exitosamente!');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Error en la migración:', error.message);
    if (error.code) console.error(`   Código: ${error.code}`);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Conexión cerrada');
  }
}

migrate();
