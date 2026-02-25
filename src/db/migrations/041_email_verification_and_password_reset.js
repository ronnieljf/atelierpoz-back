/**
 * Migración 041: Tablas y campos para verificación de email y recuperación de contraseña
 * - email_verification_codes: códigos de verificación (registro y recuperación)
 * - users.email_verified: indica si el email fue verificado
 *
 * Ejecutar con: node src/db/migrations/041_email_verification_and_password_reset.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: email_verification_and_password_reset\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) NOT NULL,
        code VARCHAR(10) NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('register', 'password_reset')),
        meta JSONB,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✅ Tabla email_verification_codes creada');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email 
      ON email_verification_codes(email)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email_type 
      ON email_verification_codes(email, type)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_verification_codes_expires 
      ON email_verification_codes(expires_at)
    `);

    const { rows: colExists } = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'email_verified'
    `);
    if (colExists.length === 0) {
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN email_verified BOOLEAN DEFAULT false NOT NULL
      `);
      console.log('  ✅ Columna email_verified agregada a users');
    } else {
      console.log('  ⏭️  Columna email_verified ya existe');
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
