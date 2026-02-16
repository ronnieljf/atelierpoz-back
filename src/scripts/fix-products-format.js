/**
 * Script independiente en el backend para arreglar productos existentes en la BD.
 * Obtiene todos los productos, normaliza precios y variantes, y los actualiza
 * para que sean compatibles con lo que espera el carrito en el frontend:
 *
 * - base_price: número (el carrito usa product.basePrice para calcular totales)
 * - stock: entero
 * - attributes[].variants[].price: número (se usa como priceModifier en el carrito)
 * - attributes[].variants[].stock: número
 * - combinations[].stock y combinations[].priceModifier: números
 *
 * Uso:
 *   npm run fix:products          # aplica cambios en la BD
 *   npm run fix:products -- --dry-run   # solo muestra qué se haría, no escribe
 *
 * Requiere: .env con DATABASE_URL
 */

import 'dotenv/config';
import { pool } from '../config/database.js';

const isDryRun = process.argv.includes('--dry-run');

function toNumber(value, defaultValue = 0) {
  if (value == null || value === '') return defaultValue;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isNaN(n) ? defaultValue : n;
}

function toInt(value, defaultValue = 0) {
  if (value == null || value === '') return defaultValue;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isNaN(n) ? defaultValue : n;
}

/**
 * Normaliza un array de atributos: variant.price y variant.stock como números
 */
function normalizeAttributes(attributes) {
  if (!Array.isArray(attributes) || attributes.length === 0) return attributes;
  return attributes.map((attr) => {
    if (!attr || typeof attr !== 'object') return attr;
    const variants = Array.isArray(attr.variants)
      ? attr.variants.map((v) => {
          if (!v || typeof v !== 'object') return v;
          return {
            ...v,
            price: toNumber(v.price, 0),
            stock: toInt(v.stock, 0),
          };
        })
      : [];
    return { ...attr, variants };
  });
}

/**
 * Normaliza combinaciones: stock y priceModifier como números
 */
function normalizeCombinations(combinations) {
  if (!Array.isArray(combinations) || combinations.length === 0) return combinations;
  return combinations.map((c) => {
    if (!c || typeof c !== 'object') return c;
    const stock = toInt(c.stock, 0);
    const priceModifier = c.priceModifier != null && c.priceModifier !== ''
      ? toNumber(c.priceModifier, 0)
      : undefined;
    return { ...c, stock, ...(priceModifier !== undefined && { priceModifier }) };
  });
}

async function run() {
  console.log('🔧 Script: arreglar productos para compatibilidad con el carrito (frontend)\n');
  if (isDryRun) {
    console.log('⚠️  Modo --dry-run: no se escribirá en la base de datos.\n');
  }

  const client = await pool.connect();

  try {
    const selectResult = await client.query(
      `SELECT id, store_id, base_price, stock, attributes, combinations
       FROM products`
    );
    const rows = selectResult.rows || [];
    console.log(`📦 Productos encontrados: ${rows.length}\n`);

    if (rows.length === 0) {
      console.log('No hay productos para normalizar.');
      return;
    }

    let updated = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        const basePrice = toNumber(row.base_price, 0);
        const stock = toInt(row.stock, 0);
        const rawAttributes = row.attributes;
        const rawCombinations = row.combinations;

        const attributes = Array.isArray(rawAttributes)
          ? normalizeAttributes(rawAttributes)
          : rawAttributes != null ? rawAttributes : [];
        const combinations = Array.isArray(rawCombinations)
          ? normalizeCombinations(rawCombinations)
          : rawCombinations != null ? rawCombinations : [];

        if (!isDryRun) {
          await client.query(
            `UPDATE products
             SET base_price = $1, stock = $2, attributes = $3::jsonb, combinations = $4::jsonb, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5 AND store_id = $6`,
            [
              basePrice,
              stock,
              JSON.stringify(attributes),
              JSON.stringify(combinations),
              row.id,
              row.store_id,
            ]
          );
        }
        updated++;
        console.log(`  ${isDryRun ? '🔍' : '✅'} ${row.id} (store: ${row.store_id})`);
      } catch (err) {
        errors++;
        console.error(`  ❌ ${row.id}: ${err.message}`);
      }
    }

    console.log(
      `\n${isDryRun ? '🔍 Dry-run' : '✅ Normalización'} completada. Productos a procesar/actualizados: ${updated}, Errores: ${errors}`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
