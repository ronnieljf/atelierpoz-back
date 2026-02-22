/**
 * Migración: Agregar columna number_stores a la tabla users.
 * Controla cuántas tiendas puede crear cada usuario (como creador).
 * Valor por defecto: 1.
 *
 * Ejecutar con: node src/db/migrations/035_add_number_stores_to_users.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: number_stores en users\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'number_stores'
    `);

    if (rows.length > 0) {
      console.log('  ⏭️  Columna number_stores ya existe, saltando...');
    } else {
      await client.query(`
        ALTER TABLE users ADD COLUMN number_stores INTEGER DEFAULT 1 NOT NULL
      `);
      console.log('  ✅ Columna number_stores agregada a users');
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
