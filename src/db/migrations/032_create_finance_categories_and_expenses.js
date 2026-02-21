/**
 * Migración: Crear tablas de categorías financieras (income_categories, expense_categories)
 * y tabla de gastos/cuentas por pagar (expenses), con pagos parciales y logs.
 * También añade category_id opcional a receivables y sales.
 * Ejecutar con: node src/db/migrations/032_create_finance_categories_and_expenses.js
 */

import { createDirectClient } from '../../config/database.js';

async function migrate() {
  console.log('🚀 Iniciando migración: Categorías financieras + Gastos/Cuentas por pagar\n');

  const client = createDirectClient();

  try {
    await client.connect();
    await client.query('BEGIN');

    // ── income_categories ──
    const incCatCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'income_categories'
    `);
    if (incCatCheck.rows.length === 0) {
      console.log('📝 Creando tabla income_categories...');
      await client.query(`
        CREATE TABLE income_categories (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          color VARCHAR(30),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`CREATE INDEX idx_income_categories_store ON income_categories(store_id)`);
      await client.query(`CREATE UNIQUE INDEX idx_income_categories_store_name ON income_categories(store_id, LOWER(name))`);
      console.log('✅ income_categories creada');
    } else {
      console.log('⚠️  income_categories ya existe');
    }

    // ── expense_categories ──
    const expCatCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'expense_categories'
    `);
    if (expCatCheck.rows.length === 0) {
      console.log('📝 Creando tabla expense_categories...');
      await client.query(`
        CREATE TABLE expense_categories (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          color VARCHAR(30),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`CREATE INDEX idx_expense_categories_store ON expense_categories(store_id)`);
      await client.query(`CREATE UNIQUE INDEX idx_expense_categories_store_name ON expense_categories(store_id, LOWER(name))`);
      console.log('✅ expense_categories creada');
    } else {
      console.log('⚠️  expense_categories ya existe');
    }

    // ── expenses (gastos / cuentas por pagar) ──
    const expCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'expenses'
    `);
    if (expCheck.rows.length === 0) {
      console.log('📝 Creando tabla expenses...');
      await client.query(`
        CREATE TABLE expenses (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          expense_number INTEGER NOT NULL,
          created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
          category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
          vendor_name VARCHAR(255),
          vendor_phone VARCHAR(50),
          description TEXT,
          amount DECIMAL(10, 2) NOT NULL,
          currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
          status VARCHAR(50) DEFAULT 'pending' NOT NULL,
          due_date DATE,
          paid_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_expenses_status CHECK (status IN ('pending', 'paid', 'cancelled'))
        )
      `);
      await client.query(`CREATE UNIQUE INDEX idx_expenses_store_number ON expenses(store_id, expense_number)`);
      await client.query(`CREATE INDEX idx_expenses_store_id ON expenses(store_id)`);
      await client.query(`CREATE INDEX idx_expenses_created_by ON expenses(created_by)`);
      await client.query(`CREATE INDEX idx_expenses_status ON expenses(status)`);
      await client.query(`CREATE INDEX idx_expenses_category_id ON expenses(category_id)`);
      await client.query(`CREATE INDEX idx_expenses_created_at ON expenses(created_at DESC)`);
      await client.query(`CREATE INDEX idx_expenses_due_date ON expenses(due_date)`);
      console.log('✅ expenses creada');
    } else {
      console.log('⚠️  expenses ya existe');
    }

    // ── expense_payments (abonos a gastos) ──
    const expPayCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'expense_payments'
    `);
    if (expPayCheck.rows.length === 0) {
      console.log('📝 Creando tabla expense_payments...');
      await client.query(`
        CREATE TABLE expense_payments (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
          amount DECIMAL(10, 2) NOT NULL,
          currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
          notes TEXT,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`CREATE INDEX idx_expense_payments_expense ON expense_payments(expense_id)`);
      console.log('✅ expense_payments creada');
    } else {
      console.log('⚠️  expense_payments ya existe');
    }

    // ── expenses_logs (trazabilidad) ──
    const expLogCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'expenses_logs'
    `);
    if (expLogCheck.rows.length === 0) {
      console.log('📝 Creando tabla expenses_logs...');
      await client.query(`
        CREATE TABLE expenses_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          action VARCHAR(100) NOT NULL,
          details JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`CREATE INDEX idx_expenses_logs_expense ON expenses_logs(expense_id)`);
      console.log('✅ expenses_logs creada');
    } else {
      console.log('⚠️  expenses_logs ya existe');
    }

    // ── Añadir category_id a receivables (income_category) ──
    const recvCatCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'receivables' AND column_name = 'income_category_id'
    `);
    if (recvCatCol.rows.length === 0) {
      console.log('📝 Añadiendo income_category_id a receivables...');
      await client.query(`ALTER TABLE receivables ADD COLUMN income_category_id UUID REFERENCES income_categories(id) ON DELETE SET NULL`);
      await client.query(`CREATE INDEX idx_receivables_income_category ON receivables(income_category_id)`);
      console.log('✅ income_category_id añadido a receivables');
    } else {
      console.log('⚠️  receivables.income_category_id ya existe');
    }

    // ── Añadir income_category_id a sales ──
    const salesCatCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sales' AND column_name = 'income_category_id'
    `);
    if (salesCatCol.rows.length === 0) {
      console.log('📝 Añadiendo income_category_id a sales...');
      await client.query(`ALTER TABLE sales ADD COLUMN income_category_id UUID REFERENCES income_categories(id) ON DELETE SET NULL`);
      await client.query(`CREATE INDEX idx_sales_income_category ON sales(income_category_id)`);
      console.log('✅ income_category_id añadido a sales');
    } else {
      console.log('⚠️  sales.income_category_id ya existe');
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
