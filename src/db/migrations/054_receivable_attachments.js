/**
 * Migración: Crear tabla receivable_attachments para comprobantes y archivos de respaldo
 * en cuentas por cobrar (abonos o al marcar como cobrada).
 * Ejecutar con: node src/db/migrations/054_receivable_attachments.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: receivable_attachments\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const check = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'receivable_attachments'
    `);

    if (check.rows.length > 0) {
      console.log('⚠️  La tabla receivable_attachments ya existe');
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      CREATE TABLE receivable_attachments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        receivable_id UUID NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
        payment_id UUID REFERENCES receivable_payments(id) ON DELETE SET NULL,
        file_name VARCHAR(255) NOT NULL,
        file_url TEXT NOT NULL,
        file_key VARCHAR(512) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await client.query(`CREATE INDEX idx_receivable_attachments_receivable_id ON receivable_attachments(receivable_id)`);
    await client.query(`CREATE INDEX idx_receivable_attachments_payment_id ON receivable_attachments(payment_id)`);
    await client.query(`CREATE INDEX idx_receivable_attachments_created_at ON receivable_attachments(created_at DESC)`);

    console.log('✅ Tabla receivable_attachments creada');
    await client.query('COMMIT');
    console.log('\n✅ Migración completada');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
