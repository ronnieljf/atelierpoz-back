/**
 * Migración 042: Tabla para registrar envíos del template invitacion_cuentas_por_cobrar.
 * Máximo 2 envíos por tienda (invitation_number 1 y 2).
 *
 * Ejecutar con: node src/db/migrations/042_store_receivable_invitation_sent.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: store_receivable_invitation_sent\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS store_receivable_invitation_sent (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        invitation_number SMALLINT NOT NULL CHECK (invitation_number IN (1, 2)),
        UNIQUE(store_id, invitation_number)
      )
    `);
    console.log('  ✅ Tabla store_receivable_invitation_sent creada');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_store_receivable_invitation_store_id
      ON store_receivable_invitation_sent(store_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_store_receivable_invitation_sent_at
      ON store_receivable_invitation_sent(sent_at)
    `);

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
