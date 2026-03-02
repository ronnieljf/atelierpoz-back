/**
 * Migración 051: Agregar columna contact a client_recurring_reminders.
 * El contacto es el teléfono o email donde el cliente puede responder (input de texto).
 *
 * Ejecutar con: node src/db/migrations/051_add_contact_to_recurring_reminders.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: agregar contact a recordatorios recurrentes\n');

  const dbClient = createDirectClient();

  try {
    await dbClient.connect();
    await dbClient.query('BEGIN');

    const hasContact = await dbClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'client_recurring_reminders' AND column_name = 'contact'
    `);
    if (hasContact.rows.length === 0) {
      await dbClient.query(`
        ALTER TABLE client_recurring_reminders
        ADD COLUMN contact VARCHAR(255)
      `);
      console.log('  ✅ Columna contact agregada');
    } else {
      console.log('  ⏭️  Columna contact ya existe');
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
