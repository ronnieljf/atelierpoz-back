/**
 * Migración: Tablas de permisos por tienda.
 * - permissions: códigos de permiso (products.view, sales.create, etc.)
 * - store_user_permissions: permisos asignados a cada usuario por tienda
 *
 * Ejecutar con: node src/db/migrations/036_create_permissions.js
 */

import { createDirectClient } from '../../config/database.js';

const PERMISSIONS_SEED = [
  { code: 'products.view', name: 'Ver módulo de productos', module: 'products' },
  { code: 'products.create', name: 'Crear producto', module: 'products' },
  { code: 'products.edit', name: 'Editar producto', module: 'products' },
  { code: 'categories.view', name: 'Ver categorías de productos', module: 'categories' },
  { code: 'categories.create', name: 'Crear categoría de producto', module: 'categories' },
  { code: 'categories.edit', name: 'Editar categoría de producto', module: 'categories' },
  { code: 'sales.view', name: 'Ver ventas', module: 'sales' },
  { code: 'sales.create', name: 'Registrar una venta', module: 'sales' },
  { code: 'sales.cancel', name: 'Cancelar o devolver una venta', module: 'sales' },
  { code: 'receivables.view', name: 'Ver cuentas por cobrar', module: 'receivables' },
  { code: 'receivables.create', name: 'Crear cuenta por cobrar', module: 'receivables' },
  { code: 'receivables.edit', name: 'Editar cuenta por cobrar', module: 'receivables' },
  { code: 'clients.view', name: 'Ver clientes', module: 'clients' },
  { code: 'clients.create', name: 'Crear cliente', module: 'clients' },
  { code: 'clients.edit', name: 'Editar cliente', module: 'clients' },
  { code: 'vendors.view', name: 'Ver proveedores', module: 'vendors' },
  { code: 'vendors.create', name: 'Crear proveedor', module: 'vendors' },
  { code: 'vendors.edit', name: 'Editar proveedor', module: 'vendors' },
  { code: 'purchases.view', name: 'Ver compras', module: 'purchases' },
  { code: 'purchases.create', name: 'Crear compra', module: 'purchases' },
  { code: 'purchases.edit', name: 'Editar compra', module: 'purchases' },
  { code: 'expenses.view', name: 'Ver gastos', module: 'expenses' },
  { code: 'expenses.create', name: 'Crear gasto', module: 'expenses' },
  { code: 'expenses.edit', name: 'Editar gasto', module: 'expenses' },
  { code: 'finance_categories.view', name: 'Ver categorías financieras', module: 'finance_categories' },
  { code: 'finance_categories.create', name: 'Crear categoría financiera', module: 'finance_categories' },
  { code: 'finance_categories.edit', name: 'Editar categoría financiera', module: 'finance_categories' },
  { code: 'requests.view', name: 'Ver pedidos', module: 'requests' },
  { code: 'requests.create', name: 'Crear pedido', module: 'requests' },
  { code: 'requests.edit', name: 'Editar pedido', module: 'requests' },
  { code: 'reports.view', name: 'Ver reportes', module: 'reports' },
  { code: 'stores.view', name: 'Ver tiendas', module: 'stores' },
  { code: 'stores.manage_users', name: 'Gestionar usuarios de la tienda', module: 'stores' },
];

async function migrate() {
  console.log('🚀 Iniciando migración: Permisos y store_user_permissions\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    const tablePerms = await client.query(`
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'permissions'
    `);
    if (tablePerms.rows.length === 0) {
      await client.query(`
        CREATE TABLE permissions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          code VARCHAR(100) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          module VARCHAR(80) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✅ Tabla permissions creada');
    } else {
      console.log('  ⏭️  Tabla permissions ya existe');
    }

    const tableSup = await client.query(`
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_user_permissions'
    `);
    if (tableSup.rows.length === 0) {
      await client.query(`
        CREATE TABLE store_user_permissions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(store_id, user_id, permission_id)
        )
      `);
      await client.query(`
        CREATE INDEX idx_store_user_permissions_store_user ON store_user_permissions(store_id, user_id)
      `);
      console.log('  ✅ Tabla store_user_permissions creada');
    } else {
      console.log('  ⏭️  Tabla store_user_permissions ya existe');
    }

    for (const p of PERMISSIONS_SEED) {
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
