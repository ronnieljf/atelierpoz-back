/**
 * Script para insertar productos de la categoría "Amor" en la tienda floristeriaemina.
 * - Crea la categoría "Amor" si no existe (slug: amor).
 * - Sube las imágenes de carga-inicial-floristeriaemina (1.jpeg a 35.jpeg) a R2.
 * - Inserta 35 productos sin variantes: nombre, precio, descripción común, stock 100, visible en tienda.
 *
 * Ejecutar: node src/scripts/seed-floristeriaemina-amor.js
 * Requiere: .env con DATABASE_URL, R2_* (o R2_PUBLIC_URL para URLs permanentes).
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDirectClient } from '../config/database.js';
import { uploadFile } from '../services/uploadService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_ID = 'c18c6bb3-415e-4829-b692-6a31da3d0c19';
const CREATED_BY_USER_ID = '3214d459-2acd-4bb2-ad9c-8f8195876076';
const IMAGES_DIR = join(__dirname, 'carga-inicial-floristeriaemina');
const UPLOAD_FOLDER = 'floristeriaemina-amor';

const PRODUCT_DESCRIPTION =
  "Nada dice 'te quiero' como nuestras rosas premium. 💖 Elegancia, frescura y ese aroma increíble que enamora. El detalle perfecto para sorprender y dejar una huella en el corazón. 🎀🌹 ¡Pide las tuyas!";

const PRODUCTS = [
  { Nombre: 'Ramillete deluxe 24', Precio: 110 },
  { Nombre: 'Ramillete Armonía de 6', Precio: 65 },
  { Nombre: 'Corazón 50 rosas', Precio: 150 },
  { Nombre: 'Ramillte', Precio: 45 },
  { Nombre: 'Ramillete madrina', Precio: 35 },
  { Nombre: 'Arreglo base coreana', Precio: 90 },
  { Nombre: 'Base coreana 12 rosas', Precio: 95 },
  { Nombre: 'Madrina', Precio: 35 },
  { Nombre: 'Caja de 4 rosas', Precio: 30 },
  { Nombre: 'Caja sorpresa', Precio: 90 },
  { Nombre: 'Arreglo base coreana  de 24', Precio: 150 },
  { Nombre: 'Corazón 50 rosas', Precio: 190 },
  { Nombre: 'Tres girasole', Precio: 20 },
  { Nombre: 'Corazón y Ferrero', Precio: 95 },
  { Nombre: 'Ramo buchona de 100 rosas', Precio: 300 },
  { Nombre: 'Caja variada', Precio: 55 },
  { Nombre: 'Base asiática', Precio: 90 },
  { Nombre: '12 rosas y follaje', Precio: 65 },
  { Nombre: '12 rosas', Precio: 60 },
  { Nombre: 'Ramo graduación', Precio: 75 },
  { Nombre: 'Cilindro 6', Precio: 30 },
  { Nombre: 'Caja grande', Precio: 65 },
  { Nombre: 'Buchón de 50 rosas', Precio: 190 },
  { Nombre: 'Buchón de 200 rosas', Precio: 590 },
  { Nombre: '12 rosas y papel coreano', Precio: 60 },
  { Nombre: 'Corazón', Precio: 80 },
  { Nombre: 'Caja roja', Precio: 55 },
  { Nombre: 'Cilindro  acetato 12 rosas', Precio: 65 },
  { Nombre: 'Cilindro de rosas', Precio: 30 },
  { Nombre: 'Cono de 24', Precio: 100 },
  { Nombre: 'Cono de 6', Precio: 30 },
  { Nombre: 'Cilindro acetato de 3 rosas', Precio: 20 },
  { Nombre: 'Caja primavera', Precio: 55 },
  { Nombre: 'Base asiática 24 rosas', Precio: 150 },
  { Nombre: 'Corazón', Precio: 190 },
];

async function run() {
  const client = createDirectClient();

  if (!existsSync(IMAGES_DIR)) {
    console.error(`❌ No existe la carpeta de imágenes: ${IMAGES_DIR}`);
    process.exit(1);
  }

  try {
    await client.connect();

    // 1. Verificar tienda y obtener created_by
    const storeRes = await client.query(
      'SELECT id, name, created_by FROM stores WHERE id = $1 AND state = $2',
      [STORE_ID, 'active']
    );
    if (storeRes.rows.length === 0) {
      throw new Error(`Tienda no encontrada o inactiva: ${STORE_ID}`);
    }
    const { name: storeName } = storeRes.rows[0];
    console.log(`✅ Tienda: ${storeName} (${STORE_ID})\n`);

    // 2. Categoría "Amor": buscar por slug (y store_id si existe) o crear
    const categorySlug = 'amor';
    const hasStoreIdInCategories = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'categories' AND column_name = 'store_id'
    `).then(r => r.rows.length > 0);

    let categoryRes;
    if (hasStoreIdInCategories) {
      categoryRes = await client.query(
        'SELECT id, name FROM categories WHERE store_id = $1 AND slug = $2',
        [STORE_ID, categorySlug]
      );
    } else {
      categoryRes = await client.query(
        'SELECT id, name FROM categories WHERE slug = $1',
        [categorySlug]
      );
    }

    let categoryId;
    if (categoryRes.rows.length > 0) {
      categoryId = categoryRes.rows[0].id;
      console.log(`✅ Categoría existente: ${categoryRes.rows[0].name} (${categoryId})\n`);
    } else {
      if (hasStoreIdInCategories) {
        const ins = await client.query(
          `INSERT INTO categories (name, slug, store_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id, name`,
          ['Amor', categorySlug, STORE_ID, CREATED_BY_USER_ID]
        );
        categoryId = ins.rows[0].id;
      } else {
        const ins = await client.query(
          `INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id, name`,
          ['Amor', categorySlug]
        );
        categoryId = ins.rows[0].id;
      }
      console.log(`✅ Categoría creada: Amor (${categoryId})\n`);
    }

    // 3. Subir imágenes y crear productos
    console.log(`📤 Subiendo imágenes y creando ${PRODUCTS.length} productos...\n`);
    await client.query('BEGIN');

    for (let i = 0; i < PRODUCTS.length; i++) {
      const product = PRODUCTS[i];
      const imageNum = i + 1;
      const imagePath = join(IMAGES_DIR, `${imageNum}.jpeg`);

      if (!existsSync(imagePath)) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Imagen no encontrada: ${imagePath}`);
      }

      const buffer = readFileSync(imagePath);
      const mime = 'image/jpeg';
      const fileName = `${imageNum}.jpeg`;
      const { url } = await uploadFile(buffer, fileName, mime, UPLOAD_FOLDER);

      const sku = `AMOR-${String(imageNum).padStart(2, '0')}`;
      await client.query(
        `INSERT INTO products (
          name, description, base_price, currency, stock, sku,
          category_id, store_id, created_by, images, attributes, combinations,
          rating, review_count, tags, visible_in_store
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          product.Nombre,
          PRODUCT_DESCRIPTION,
          product.Precio,
          'USD',
          100,
          sku,
          categoryId,
          STORE_ID,
          CREATED_BY_USER_ID,
          JSON.stringify([url]),
          JSON.stringify([]),
          JSON.stringify([]),
          null,
          0,
          JSON.stringify(['amor', 'rosas', 'floristeriaemina']),
          true,
        ]
      );

      console.log(`   [${i + 1}/${PRODUCTS.length}] ${product.Nombre} (${product.Precio} USD) — ${sku}`);
    }

    await client.query('COMMIT');
    console.log(`\n✅ ${PRODUCTS.length} productos creados en la tienda ${storeName} (categoría Amor).`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
