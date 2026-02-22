/**
 * Migración: Asignar todos los permisos a los creadores de tiendas.
 * Para cada (store_id, user_id) en store_users con is_creator = true,
 * inserta en store_user_permissions todos los permisos (evitando duplicados).
 *
 * Ejecutar con: node src/db/migrations/037_assign_all_permissions_to_creators.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Asignar todos los permisos a creadores de tiendas\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const tableSup = await client.query(`
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_user_permissions'
    `);
    if (tableSup.rows.length === 0) {
      console.log('⚠️  La tabla store_user_permissions no existe. Ejecuta antes la migración 036_create_permissions.js');
      await client.query('ROLLBACK');
      process.exit(1);
    }

    const creators = await client.query(`
      SELECT store_id, user_id FROM store_users WHERE is_creator = true
    `);
    const permissionIds = await client.query(`
      SELECT id FROM permissions ORDER BY code
    `);

    if (permissionIds.rows.length === 0) {
      console.log('⚠️  No hay permisos en la tabla permissions. Ejecuta antes la migración 036.');
      await client.query('ROLLBACK');
      process.exit(1);
    }

    let inserted = 0;
    for (const row of creators.rows) {
      const { store_id, user_id } = row;
      for (const p of permissionIds.rows) {
        const r = await client.query(
          `INSERT INTO store_user_permissions (store_id, user_id, permission_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (store_id, user_id, permission_id) DO NOTHING`,
          [store_id, user_id, p.id]
        );
        if (r.rowCount > 0) inserted += r.rowCount;
      }
    }

    console.log(`  ✅ Creadores procesados: ${creators.rows.length}`);
    console.log(`  ✅ Filas de permisos insertadas (nuevas): ${inserted}`);

    await client.query('COMMIT');
    console.log('\n✅ Migración completada exitosamente');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

migrate().catch(() => process.exit(1));
