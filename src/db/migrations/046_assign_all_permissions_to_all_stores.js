/**
 * Script: Asignar todos los permisos a todos los usuarios de todas las tiendas.
 * Para cada (store_id, user_id) en store_users, inserta en store_user_permissions
 * todos los permisos disponibles. Si el permiso ya existe, no lo agrega (ON CONFLICT DO NOTHING).
 *
 * Ejecutar con: node src/db/migrations/046_assign_all_permissions_to_all_stores.js
 */

import { createDirectClient } from '../../config/database.js';

async function run() {
  console.log('🚀 Asignando todos los permisos a todos los usuarios de todas las tiendas\n');

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

    const storeUsers = await client.query(`
      SELECT store_id, user_id FROM store_users
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
    for (const row of storeUsers.rows) {
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

    console.log(`  ✅ Usuarios de tiendas procesados: ${storeUsers.rows.length}`);
    console.log(`  ✅ Permisos disponibles: ${permissionIds.rows.length}`);
    console.log(`  ✅ Filas nuevas insertadas: ${inserted}`);

    await client.query('COMMIT');
    console.log('\n✅ Script completado exitosamente');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

run().catch(() => process.exit(1));
