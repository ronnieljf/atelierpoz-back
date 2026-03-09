/**
 * Migración: Recordatorios programables por cuenta por cobrar.
 * - Agregar due_date (fecha_vencimiento) a receivables
 * - Crear tabla receivable_reminders con datos del recordatorio y fecha de envío
 *
 * Ejecutar con: node src/db/migrations/058_receivable_reminders_and_due_date.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: receivable_reminders y due_date\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    // 1. Agregar due_date (fecha_vencimiento) a receivables
    const dueDateCol = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'receivables' AND column_name = 'due_date'`
    );
    if (dueDateCol.rows.length === 0) {
      await client.query(`ALTER TABLE receivables ADD COLUMN due_date DATE`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivables_due_date ON receivables(due_date)`);
      console.log('  ✅ Columna due_date agregada a receivables');
    } else {
      console.log('  ⏭️  Columna receivables.due_date ya existe');
    }

    // 2. Crear tabla receivable_reminders
    const tableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'receivable_reminders'`
    );

    if (tableCheck.rows.length === 0) {
      await client.query(`
        CREATE TABLE receivable_reminders (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          receivable_id UUID NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          customer_name VARCHAR(255),
          store_name VARCHAR(255),
          invoice_or_account VARCHAR(100),
          fecha_vencimiento DATE,
          datos_pagomovil TEXT,
          datos_transferencia TEXT,
          datos_binance TEXT,
          datos_contacto TEXT,
          fecha_envio DATE NOT NULL,
          status VARCHAR(20) DEFAULT 'pending' NOT NULL,
          sent_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_receivable_reminder_status CHECK (status IN ('pending', 'sent', 'cancelled'))
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivable_reminders_receivable_id ON receivable_reminders(receivable_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivable_reminders_store_id ON receivable_reminders(store_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivable_reminders_fecha_envio ON receivable_reminders(fecha_envio)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_receivable_reminders_status ON receivable_reminders(status)`);
      console.log('  ✅ Tabla receivable_reminders creada');
    } else {
      console.log('  ⏭️  Tabla receivable_reminders ya existe');
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
