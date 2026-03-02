/**
 * Migración 048: Recordatorios con múltiples destinatarios, sin plantilla.
 * - Crear tabla client_recurring_reminder_recipients (un recordatorio → muchos clientes)
 * - Migrar client_id existente a recipients
 * - Quitar client_id y message_template de client_recurring_reminders
 *
 * Ejecutar con: node src/db/migrations/048_recurring_reminders_recipients_no_template.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: recordatorios con múltiples destinatarios, sin plantilla\n');

  const dbClient = createDirectClient();

  try {
    await dbClient.connect();
    await dbClient.query('BEGIN');

    // 1. Crear tabla recipients
    let check = await dbClient.query(`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'client_recurring_reminder_recipients'
    `);
    if (check.rows.length === 0) {
      await dbClient.query(`
        CREATE TABLE client_recurring_reminder_recipients (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          client_recurring_reminder_id UUID NOT NULL REFERENCES client_recurring_reminders(id) ON DELETE CASCADE,
          client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(client_recurring_reminder_id, client_id)
        )
      `);
      await dbClient.query(`
        CREATE INDEX idx_recurring_reminder_recipients_reminder_id
        ON client_recurring_reminder_recipients(client_recurring_reminder_id)
      `);
      await dbClient.query(`
        CREATE INDEX idx_recurring_reminder_recipients_client_id
        ON client_recurring_reminder_recipients(client_id)
      `);
      console.log('  ✅ Tabla client_recurring_reminder_recipients creada');
    } else {
      console.log('  ⏭️  Tabla client_recurring_reminder_recipients ya existe');
    }

    // 2. Migrar datos: si client_recurring_reminders tiene client_id, crear recipients
    const hasClientId = await dbClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'client_recurring_reminders' AND column_name = 'client_id'
    `);
    if (hasClientId.rows.length > 0) {
      await dbClient.query(`
        INSERT INTO client_recurring_reminder_recipients (client_recurring_reminder_id, client_id)
        SELECT id, client_id FROM client_recurring_reminders WHERE client_id IS NOT NULL
        ON CONFLICT (client_recurring_reminder_id, client_id) DO NOTHING
      `);
      console.log('  ✅ Datos migrados a recipients');
    }

    // 3. Quitar client_id
    if (hasClientId.rows.length > 0) {
      await dbClient.query(`DROP INDEX IF EXISTS idx_client_recurring_reminders_client_id`);
      await dbClient.query(`ALTER TABLE client_recurring_reminders DROP COLUMN IF EXISTS client_id`);
      console.log('  ✅ Columna client_id eliminada');
    }

    // 4. Quitar message_template
    const hasTemplate = await dbClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'client_recurring_reminders' AND column_name = 'message_template'
    `);
    if (hasTemplate.rows.length > 0) {
      await dbClient.query(`ALTER TABLE client_recurring_reminders DROP COLUMN IF EXISTS message_template`);
      console.log('  ✅ Columna message_template eliminada');
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
