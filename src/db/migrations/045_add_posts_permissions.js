/**
 * Migración: Agregar permisos del módulo de publicaciones (Instagram).
 * - posts.view: Ver publicaciones
 * - posts.create: Crear publicación
 * - posts.edit: Editar o eliminar publicación
 *
 * Ejecutar con: node src/db/migrations/045_add_posts_permissions.js
 */

import { createDirectClient } from '../../config/database.js';

const PERMISSIONS_TO_ADD = [
  { code: 'posts.view', name: 'Ver publicaciones (Instagram)', module: 'posts' },
  { code: 'posts.create', name: 'Crear publicación', module: 'posts' },
  { code: 'posts.edit', name: 'Editar o eliminar publicación', module: 'posts' },
];

async function migrate() {
  console.log('🚀 Iniciando migración: Agregar permisos de publicaciones\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    for (const p of PERMISSIONS_TO_ADD) {
      const exists = await client.query(
        'SELECT id FROM permissions WHERE code = $1',
        [p.code]
      );
      if (exists.rows.length === 0) {
        await client.query(
          'INSERT INTO permissions (code, name, module) VALUES ($1, $2, $3)',
          [p.code, p.name, p.module]
        );
        console.log(`  ✅ Permiso insertado: ${p.code}`);
      } else {
        console.log(`  ⏭️  Permiso ya existe: ${p.code}`);
      }
    }

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
