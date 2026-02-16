/**
 * Migración: Crear tabla whatsapp_message_logs para registrar los mensajes
 * de recordatorio por WhatsApp (número, tienda, template, cuentas incluidas, éxito/error).
 * Ejecutar con: node src/db/migrations/031_create_whatsapp_message_logs.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Crear tabla whatsapp_message_logs\n');

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    const check = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'whatsapp_message_logs'
    `);

    if (check.rows.length > 0) {
      console.log('⚠️  La tabla whatsapp_message_logs ya existe');
      await client.query('COMMIT');
      console.log('\n✅ Migración completada (sin cambios necesarios)');
      return;
    }

    console.log('📝 Creando tabla whatsapp_message_logs...');
    await client.query(`
      CREATE TABLE whatsapp_message_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        phone VARCHAR(50) NOT NULL,
        template_name VARCHAR(100) NOT NULL,
        receivable_ids JSONB NOT NULL DEFAULT '[]',
        message_id VARCHAR(255),
        success BOOLEAN NOT NULL DEFAULT true,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla creada exitosamente');

    await client.query(`
      CREATE INDEX idx_whatsapp_message_logs_store_id ON whatsapp_message_logs(store_id)
    `);
    await client.query(`
      CREATE INDEX idx_whatsapp_message_logs_created_at ON whatsapp_message_logs(created_at)
    `);
    console.log('✅ Índices creados');

    await client.query('COMMIT');
    console.log('\n✅ Migración completada exitosamente!');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
    console.log('\n🔌 Conexión cerrada');
  }
}

migrate().catch((err) => {
  console.error('\n❌ Error en la migración:', err.message);
  if (err.code) console.error(`   Código: ${err.code}`);
  process.exit(1);
});
