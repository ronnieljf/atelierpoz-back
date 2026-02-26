/**
 * Migración 043: Encuesta de onboarding post-registro.
 * Tipo de negocio, tamaño, línea/productos, edad.
 *
 * Ejecutar con: node src/db/migrations/043_user_onboarding_survey.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: user_onboarding_survey\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_onboarding_survey (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        business_type VARCHAR(255),
        business_size VARCHAR(100),
        product_line TEXT,
        age SMALLINT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✅ Tabla user_onboarding_survey creada');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_onboarding_survey_user_id
      ON user_onboarding_survey(user_id)
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
