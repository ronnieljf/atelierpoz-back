/**
 * Migración 047: Recordatorios de pagos recurrentes por cliente.
 * Usa la tabla clients. Permite configurar cobros recurrentes (ej. factura mensual de internet)
 * y enviar recordatorios X días antes del vencimiento.
 *
 * Tablas:
 * - client_recurring_reminders: configuración por cliente (monto, intervalo, días antes, plantilla)
 * - client_recurring_reminder_sent: control de envíos (evitar duplicados)
 *
 * Variables en plantilla: {{empresa}}, {{monto}}, {{fecha_vencimiento}}, {{contacto}}
 *
 * Ejecutar con: node src/db/migrations/047_client_recurring_payment_reminders.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: recordatorios de pagos recurrentes por cliente\n');

  const dbClient = createDirectClient();

  try {
    await dbClient.connect();
    await dbClient.query('BEGIN');

    let check = await dbClient.query(`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'client_recurring_reminders'
    `);
    if (check.rows.length === 0) {
      await dbClient.query(`
        CREATE TABLE client_recurring_reminders (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          amount DECIMAL(12, 2) NOT NULL,
          currency VARCHAR(10) NOT NULL DEFAULT 'USD',
          interval_days INTEGER NOT NULL CHECK (interval_days > 0),
          days_before_due INTEGER NOT NULL CHECK (days_before_due >= 0),
          next_due_date DATE NOT NULL,
          contact_channel VARCHAR(20) NOT NULL DEFAULT 'phone' CHECK (contact_channel IN ('phone', 'email')),
          message_template TEXT,
          enabled BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await dbClient.query(`
        CREATE INDEX idx_client_recurring_reminders_client_id ON client_recurring_reminders(client_id)
      `);
      await dbClient.query(`
        CREATE INDEX idx_client_recurring_reminders_store_id ON client_recurring_reminders(store_id)
      `);
      await dbClient.query(`
        CREATE INDEX idx_client_recurring_reminders_next_due ON client_recurring_reminders(next_due_date)
      `);
      await dbClient.query(`
        CREATE INDEX idx_client_recurring_reminders_enabled ON client_recurring_reminders(enabled)
      `);
      console.log('  ✅ Tabla client_recurring_reminders creada');
    } else {
      console.log('  ⏭️  Tabla client_recurring_reminders ya existe');
    }

    check = await dbClient.query(`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'client_recurring_reminder_sent'
    `);
    if (check.rows.length === 0) {
      await dbClient.query(`
        CREATE TABLE client_recurring_reminder_sent (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          client_recurring_reminder_id UUID NOT NULL REFERENCES client_recurring_reminders(id) ON DELETE CASCADE,
          due_date DATE NOT NULL,
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          channel VARCHAR(20) NOT NULL CHECK (channel IN ('whatsapp', 'email')),
          UNIQUE(client_recurring_reminder_id, due_date)
        )
      `);
      await dbClient.query(`
        CREATE INDEX idx_client_recurring_reminder_sent_due_date ON client_recurring_reminder_sent(due_date)
      `);
      await dbClient.query(`
        CREATE INDEX idx_client_recurring_reminder_sent_reminder_id ON client_recurring_reminder_sent(client_recurring_reminder_id)
      `);
      console.log('  ✅ Tabla client_recurring_reminder_sent creada');
    } else {
      console.log('  ⏭️  Tabla client_recurring_reminder_sent ya existe');
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
