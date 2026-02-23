/**
 * Migración: Tablas para recordatorios de cuentas por cobrar.
 * - receivable_reminder_sent: control de qué recordatorios ya se enviaron (evitar duplicados)
 * - reminder_notifications: notificaciones in-app para el usuario (lista en módulo Recordatorios)
 *
 * Ejecutar con: node src/db/migrations/039_receivable_reminder_sent_and_notifications.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: receivable_reminder_sent y reminder_notifications\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    let check = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'receivable_reminder_sent'
    `);
    if (check.rows.length === 0) {
      await client.query(`
        CREATE TABLE receivable_reminder_sent (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          receivable_id UUID NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
          reminder_type VARCHAR(50) NOT NULL,
          reference_date DATE NOT NULL,
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_reminder_type CHECK (reminder_type IN ('after_creation', 'after_last_payment'))
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivable_reminder_sent_receivable_id ON receivable_reminder_sent(receivable_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivable_reminder_sent_type ON receivable_reminder_sent(reminder_type)`);
      console.log('  ✅ Tabla receivable_reminder_sent creada');
    } else {
      console.log('  ⏭️  Tabla receivable_reminder_sent ya existe');
    }

    check = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'reminder_notifications'
    `);
    if (check.rows.length === 0) {
      await client.query(`
        CREATE TABLE reminder_notifications (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          receivable_id UUID NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
          reminder_type VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          dismissed_at TIMESTAMP,
          CONSTRAINT chk_reminder_notif_type CHECK (reminder_type IN ('after_creation', 'after_last_payment'))
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_reminder_notifications_user_id ON reminder_notifications(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_reminder_notifications_dismissed ON reminder_notifications(dismissed_at)`);
      console.log('  ✅ Tabla reminder_notifications creada');
    } else {
      console.log('  ⏭️  Tabla reminder_notifications ya existe');
    }

    await client.query('COMMIT');
    console.log('\n✅ Migración completada exitosamente');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en migración:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

migrate().catch(() => process.exit(1));
