/**
 * Migración 053: Agregar service_started_at a client_recurring_reminder_recipients.
 * Fecha en que cada cliente inició el servicio (para prorratear si inicia a mitad de mes).
 *
 * Ejecutar con: node src/db/migrations/053_add_service_started_at_to_recipients.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: service_started_at en recipients\n');

  const dbClient = createDirectClient();

  try {
    await dbClient.connect();
    await dbClient.query('BEGIN');

    const hasCol = await dbClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'client_recurring_reminder_recipients' AND column_name = 'service_started_at'
    `);
    if (hasCol.rows.length === 0) {
      await dbClient.query(`
        ALTER TABLE client_recurring_reminder_recipients
        ADD COLUMN service_started_at DATE
      `);
      console.log('  ✅ Columna service_started_at agregada');
    } else {
      console.log('  ⏭️  Columna service_started_at ya existe');
    }

    await dbClient.query('COMMIT');
    console.log('\n✅ Migración completada exitosamente');
  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('❌ Error en migración:', error.message);
    throw error;
  } finally {
    await dbClient.end();
  }
}

migrate().catch(() => process.exit(1));
