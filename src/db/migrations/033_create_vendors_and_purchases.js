/**
 * Migración: Crear tabla vendors (proveedores), purchases (compras al contado)
 * y añadir vendor_id a expenses (cuentas por pagar).
 * Ejecutar con: node src/db/migrations/033_create_vendors_and_purchases.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Vendors + Purchases + vendor_id en expenses\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    // ── vendors (proveedores) — espejo de clients ──
    const vendorCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'vendors'
    `);
    if (vendorCheck.rows.length === 0) {
      console.log('📝 Creando tabla vendors...');
      await client.query(`
        CREATE TABLE vendors (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          name TEXT,
          phone VARCHAR(50),
          email VARCHAR(255),
          address TEXT,
          identity_document VARCHAR(50),
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`CREATE INDEX idx_vendors_store_id ON vendors(store_id)`);
      await client.query(`CREATE INDEX idx_vendors_phone ON vendors(phone)`);
      await client.query(`CREATE UNIQUE INDEX idx_vendors_store_phone ON vendors(store_id, phone) WHERE phone IS NOT NULL`);
      console.log('✅ vendors creada');
    } else {
      console.log('⚠️  vendors ya existe');
    }

    // ── purchases (compras al contado) — espejo de sales ──
    const purchaseCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'purchases'
    `);
    if (purchaseCheck.rows.length === 0) {
      console.log('📝 Creando tabla purchases...');
      await client.query(`
        CREATE TABLE purchases (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
          created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          purchase_number INTEGER NOT NULL,
          category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
          description TEXT,
          items JSONB NOT NULL DEFAULT '[]'::jsonb,
          total DECIMAL(10, 2) NOT NULL,
          currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
          status VARCHAR(50) DEFAULT 'completed' NOT NULL,
          payment_method VARCHAR(100),
          notes TEXT,
          paid_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_purchases_status CHECK (status IN ('completed', 'refunded', 'cancelled'))
        )
      `);
      await client.query(`CREATE UNIQUE INDEX idx_purchases_store_number ON purchases(store_id, purchase_number)`);
      await client.query(`CREATE INDEX idx_purchases_store_id ON purchases(store_id)`);
      await client.query(`CREATE INDEX idx_purchases_vendor_id ON purchases(vendor_id)`);
      await client.query(`CREATE INDEX idx_purchases_category_id ON purchases(category_id)`);
      await client.query(`CREATE INDEX idx_purchases_status ON purchases(status)`);
      await client.query(`CREATE INDEX idx_purchases_created_at ON purchases(created_at DESC)`);
      console.log('✅ purchases creada');
    } else {
      console.log('⚠️  purchases ya existe');
    }

    // ── purchases_logs (trazabilidad de compras) ──
    const pLogCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'purchases_logs'
    `);
    if (pLogCheck.rows.length === 0) {
      console.log('📝 Creando tabla purchases_logs...');
      await client.query(`
        CREATE TABLE purchases_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          action VARCHAR(100) NOT NULL,
          details JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`CREATE INDEX idx_purchases_logs_purchase ON purchases_logs(purchase_id)`);
      console.log('✅ purchases_logs creada');
    } else {
      console.log('⚠️  purchases_logs ya existe');
    }

    // ── Añadir vendor_id a expenses (cuentas por pagar) ──
    const expVendorCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'expenses' AND column_name = 'vendor_id'
    `);
    if (expVendorCol.rows.length === 0) {
      console.log('📝 Añadiendo vendor_id a expenses...');
      await client.query(`ALTER TABLE expenses ADD COLUMN vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL`);
      await client.query(`CREATE INDEX idx_expenses_vendor_id ON expenses(vendor_id)`);
      console.log('✅ vendor_id añadido a expenses');
    } else {
      console.log('⚠️  expenses.vendor_id ya existe');
    }

    await client.query('COMMIT');
    console.log('\n✅ Migración completada exitosamente!');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Error en la migración:', error.message);
    if (error.code) console.error(`   Código: ${error.code}`);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Conexión cerrada');
  }
}

migrate();
