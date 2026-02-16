/**
 * Script para crear 100 productos de prueba:
 * - Sube todas las imágenes de scripts/images-mock a R2 (uploadFile redimensiona/comprime las pesadas).
 * - Crea productos con y sin variantes, textos Lorem, imágenes aleatorias.
 *
 * Ejecutar: node src/scripts/seed-100-mock-products.js
 * Requiere: .env con DATABASE_URL, R2_* (o R2_PUBLIC_URL para URLs permanentes).
 */

import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDirectClient } from '../config/database.js';
import { uploadFile } from '../services/uploadService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, 'images-mock');
const MOCK_FOLDER = 'mock-products';
const NUM_PRODUCTS = 100;

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
};

const LOREM_WORDS = [
  'Lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
  'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
  'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
  'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
  'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint',
  'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia',
  'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum',
];

const CATEGORIES = [
  { name: 'Anillos', slug: 'rings' },
  { name: 'Collares', slug: 'necklaces' },
  { name: 'Pulseras', slug: 'bracelets' },
  { name: 'Aretes', slug: 'earrings' },
  { name: 'Relojes', slug: 'watches' },
  { name: 'Accesorios', slug: 'accessories' },
];

const ATTR_TEMPLATES = [
  { name: 'Color', type: 'color', options: ['Plata', 'Oro', 'Negro', 'Rosa', 'Azul'] },
  { name: 'Talla', type: 'size', options: ['S', 'M', 'L', 'XL'] },
  { name: 'Material', type: 'select', options: ['Acero', 'Plata 925', 'Oro 18k', 'Cuero'] },
  { name: 'Longitud', type: 'select', options: ['40 cm', '45 cm', '50 cm', '60 cm'] },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loremWords(n) {
  const w = shuffle(LOREM_WORDS).slice(0, Math.min(n, LOREM_WORDS.length));
  return w.join(' ');
}

function loremTitle() {
  const n = randomInt(2, 4);
  return loremWords(n).replace(/\b\w/g, (c) => c.toUpperCase());
}

function loremDescription() {
  const sentences = randomInt(2, 4);
  const out = [];
  for (let i = 0; i < sentences; i++) {
    const len = randomInt(8, 18);
    out.push(loremWords(len) + '.');
  }
  return out.join(' ');
}

function sku(index) {
  const r = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `MOCK-${String(index + 1).padStart(3, '0')}-${r}`;
}

function pickImages(urls, count) {
  const c = Math.min(count, urls.length);
  return shuffle(urls).slice(0, c);
}

function buildAttributes(imageUrls) {
  const t = randomItem(ATTR_TEMPLATES);
  const opts = shuffle(t.options).slice(0, randomInt(2, t.options.length));
  const ts = Date.now();
  const variants = opts.map((opt, idx) => ({
    id: `var-${ts}-${idx}`,
    name: opt,
    value: opt,
    stock: randomInt(5, 80),
    sku: `V-${opt.slice(0, 2).toUpperCase()}-${idx}`,
    price: Math.random() < 0.3 ? randomInt(2, 25) : 0,
    images: [randomItem(imageUrls)],
  }));
  return [{
    id: `attr-${ts}`,
    name: t.name,
    type: t.type,
    required: true,
    variants,
  }];
}

function totalStockFromAttributes(attrs) {
  let n = 0;
  for (const a of attrs) {
    for (const v of a.variants || []) n += v.stock || 0;
  }
  return n || randomInt(10, 100);
}

async function loadAndUploadImages() {
  const files = readdirSync(IMAGES_DIR).filter((f) => {
    const ext = extname(f).toLowerCase();
    return MIME_BY_EXT[ext];
  });

  if (files.length === 0) {
    throw new Error(`No hay imágenes en ${IMAGES_DIR}`);
  }

  const results = [];
  for (const file of files) {
    const filePath = join(IMAGES_DIR, file);
    const buffer = readFileSync(filePath);
    const ext = extname(file).toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    const { url } = await uploadFile(buffer, file, mime, MOCK_FOLDER);
    results.push(url);
  }
  return results;
}

async function run() {
  const client = createDirectClient();

  try {
    await client.connect();

    console.log('📤 Subiendo imágenes mock a R2...');
    const imageUrls = await loadAndUploadImages();
    console.log(`   ${imageUrls.length} imágenes subidas.\n`);

    const storeRes = await client.query(
      "SELECT id, created_by FROM stores WHERE state = 'active' LIMIT 1"
    );
    if (storeRes.rows.length === 0) {
      throw new Error('No hay tienda activa. Ejecuta seed primero.');
    }
    const { id: storeId, created_by: userId } = storeRes.rows[0];

    const categoryIds = new Map();
    for (const c of CATEGORIES) {
      const exist = await client.query(
        'SELECT id FROM categories WHERE store_id = $1 AND slug = $2',
        [storeId, c.slug]
      );
      let catId;
      if (exist.rows.length > 0) {
        catId = exist.rows[0].id;
      } else {
        const ins = await client.query(
          `INSERT INTO categories (name, slug, store_id, created_by)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [c.name, c.slug, storeId, userId]
        );
        catId = ins.rows[0].id;
      }
      categoryIds.set(c.slug, catId);
    }

    const categorySlugs = CATEGORIES.map((c) => c.slug);
    let withVariants = 0;
    let withoutVariants = 0;

    await client.query('BEGIN');

    for (let i = 0; i < NUM_PRODUCTS; i++) {
      const slug = randomItem(categorySlugs);
      const categoryId = categoryIds.get(slug);
      const hasVariants = Math.random() < 0.5;
      if (hasVariants) withVariants++;
      else withoutVariants++;

      const attributes = hasVariants ? buildAttributes(imageUrls) : [];
      const stock = totalStockFromAttributes(attributes);
      const productImages = pickImages(imageUrls, randomInt(1, 4));
      const basePrice = randomInt(8, 120) + Math.random() * randomInt(0, 99);
      const rating = Math.random() < 0.6 ? parseFloat((Math.random() * 2 + 3).toFixed(2)) : null;
      const reviewCount = rating ? randomInt(3, 80) : 0;
      const tags = ['mock', 'lorem', randomItem(['accesorio', 'joyería', 'premium', 'test'])];

      await client.query(
        `INSERT INTO products (
          name, description, base_price, currency, stock, sku,
          category_id, store_id, created_by, images, attributes,
          rating, review_count, tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          loremTitle(),
          loremDescription(),
          Number(basePrice.toFixed(2)),
          'USD',
          stock,
          sku(i),
          categoryId,
          storeId,
          userId,
          JSON.stringify(productImages),
          JSON.stringify(attributes),
          rating,
          reviewCount,
          JSON.stringify(tags),
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`\n✅ ${NUM_PRODUCTS} productos creados (${withVariants} con variantes, ${withoutVariants} sin variantes).`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
