/**
 * Script para crear 100 productos de prueba
 * Ejecutar con: node src/db/scripts/create_test_products.js
 */

import { createDirectClient } from '../../config/database.js';

// Configuración de productos por tipo
const PRODUCT_TYPES = {
  anillo: {
    image: 'https://pub-f8968a35b43a43799c31c2ba7be6cfb1.r2.dev/tests/anillo.webp',
    categorySlug: 'rings',
    categoryName: 'Anillos',
    baseNames: [
      'Anillo de Plata 925',
      'Anillo de Oro 18k',
      'Anillo de Acero Inoxidable',
      'Anillo de Titanio',
      'Anillo de Cobre',
      'Anillo Clásico Elegante',
      'Anillo Moderno Minimalista',
      'Anillo Vintage Retro',
      'Anillo con Piedra Preciosa',
      'Anillo de Compromiso',
      'Anillo de Boda',
      'Anillo de Eternidad',
      'Anillo de Promesa',
      'Anillo de Amistad',
      'Anillo de Graduación',
      'Anillo Personalizado',
      'Anillo Artesanal',
      'Anillo de Diseño Único',
      'Anillo Exclusivo',
      'Anillo de Lujo',
      'Anillo Premium',
      'Anillo de Colección',
      'Anillo Limitado',
      'Anillo Especial',
      'Anillo Único',
    ],
    basePriceRange: { min: 25, max: 500 },
    sizes: ['5', '6', '7', '8', '9', '10', '11'],
    colors: ['Plata', 'Oro', 'Oro Rosa', 'Negro', 'Blanco'],
    materials: ['Plata 925', 'Oro 18k', 'Acero Inoxidable', 'Titanio'],
  },
  argolla: {
    image: 'https://pub-f8968a35b43a43799c31c2ba7be6cfb1.r2.dev/tests/argolla.jpg',
    categorySlug: 'rings',
    categoryName: 'Anillos',
    baseNames: [
      'Argolla de Plata',
      'Argolla de Oro',
      'Argolla Clásica',
      'Argolla Moderna',
      'Argolla de Compromiso',
      'Argolla de Boda',
      'Argolla Elegante',
      'Argolla Minimalista',
      'Argolla de Acero',
      'Argolla de Titanio',
      'Argolla Personalizada',
      'Argolla de Lujo',
      'Argolla Premium',
      'Argolla Artesanal',
      'Argolla de Diseño',
      'Argolla Exclusiva',
      'Argolla de Colección',
      'Argolla Limitada',
      'Argolla Especial',
      'Argolla Única',
      'Argolla Vintage',
      'Argolla Retro',
      'Argolla Contemporánea',
      'Argolla Tradicional',
      'Argolla Innovadora',
    ],
    basePriceRange: { min: 30, max: 600 },
    sizes: ['5', '6', '7', '8', '9', '10', '11'],
    colors: ['Plata', 'Oro', 'Oro Rosa', 'Negro', 'Blanco'],
    materials: ['Plata 925', 'Oro 18k', 'Acero Inoxidable', 'Titanio'],
  },
  collar: {
    image: 'https://pub-f8968a35b43a43799c31c2ba7be6cfb1.r2.dev/tests/collar.avif',
    categorySlug: 'necklaces',
    categoryName: 'Collares',
    baseNames: [
      'Collar de Plata',
      'Collar de Oro',
      'Collar Elegante',
      'Collar Moderno',
      'Collar Minimalista',
      'Collar de Perlas',
      'Collar con Dije',
      'Collar Largo',
      'Collar Corto',
      'Collar de Cadena',
      'Collar de Acero',
      'Collar Personalizado',
      'Collar de Lujo',
      'Collar Premium',
      'Collar Artesanal',
      'Collar de Diseño',
      'Collar Exclusivo',
      'Collar de Colección',
      'Collar Limitado',
      'Collar Especial',
      'Collar Único',
      'Collar Vintage',
      'Collar Retro',
      'Collar Contemporáneo',
      'Collar Tradicional',
    ],
    basePriceRange: { min: 35, max: 800 },
    lengths: ['40cm', '45cm', '50cm', '55cm', '60cm'],
    colors: ['Plata', 'Oro', 'Oro Rosa', 'Negro', 'Blanco'],
    materials: ['Plata 925', 'Oro 18k', 'Acero Inoxidable', 'Cuero'],
  },
  zarcillos: {
    image: 'https://pub-f8968a35b43a43799c31c2ba7be6cfb1.r2.dev/tests/zarcillos.webp',
    categorySlug: 'earrings',
    categoryName: 'Aretes',
    baseNames: [
      'Aretes de Plata',
      'Aretes de Oro',
      'Aretes Elegantes',
      'Aretes Modernos',
      'Aretes Minimalistas',
      'Aretes de Perlas',
      'Aretes con Piedras',
      'Aretes Largos',
      'Aretes Cortos',
      'Aretes de Acero',
      'Aretes Personalizados',
      'Aretes de Lujo',
      'Aretes Premium',
      'Aretes Artesanales',
      'Aretes de Diseño',
      'Aretes Exclusivos',
      'Aretes de Colección',
      'Aretes Limitados',
      'Aretes Especiales',
      'Aretes Únicos',
      'Aretes Vintage',
      'Aretes Retro',
      'Aretes Contemporáneos',
      'Aretes Tradicionales',
      'Aretes Innovadores',
    ],
    basePriceRange: { min: 20, max: 400 },
    types: ['Argollas', 'Colgantes', 'Chandelier', 'Studs', 'Huggies'],
    colors: ['Plata', 'Oro', 'Oro Rosa', 'Negro', 'Blanco'],
    materials: ['Plata 925', 'Oro 18k', 'Acero Inoxidable', 'Titanio'],
  },
};

// Función para generar un número aleatorio entre min y max
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Función para obtener un elemento aleatorio de un array
function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Función para generar SKU único
function generateSKU(type, index) {
  const prefix = type.substring(0, 3).toUpperCase();
  return `${prefix}-${String(index + 1).padStart(3, '0')}-${Date.now().toString().slice(-6)}`;
}

// Función para generar atributos según el tipo de producto
function generateAttributes(productType, typeConfig) {
  const attributes = [];

  if (productType === 'anillo' || productType === 'argolla') {
    // Talla (usar tipo 'size' según el frontend)
    attributes.push({
      id: `attr-${Date.now()}-1`,
      name: 'talla',
      type: 'size',
      required: true,
      variants: typeConfig.sizes.map((size, idx) => ({
        id: `var-${Date.now()}-${idx}`,
        name: size,
        value: size,
        stock: randomInt(5, 50),
        sku: `T-${size}`,
      })),
    });

    // Color (usar tipo 'color' según el frontend)
    attributes.push({
      id: `attr-${Date.now()}-2`,
      name: 'color',
      type: 'color',
      required: true,
      variants: typeConfig.colors.slice(0, 3).map((color, idx) => ({
        id: `var-${Date.now()}-${idx + 10}`,
        name: color,
        value: color,
        stock: randomInt(5, 30),
        sku: `C-${color.substring(0, 2).toUpperCase()}`,
      })),
    });
  } else if (productType === 'collar') {
    // Longitud (usar tipo 'select' según el frontend)
    attributes.push({
      id: `attr-${Date.now()}-1`,
      name: 'longitud',
      type: 'select',
      required: true,
      variants: typeConfig.lengths.map((length, idx) => ({
        id: `var-${Date.now()}-${idx}`,
        name: length,
        value: length,
        stock: randomInt(5, 40),
        sku: `L-${length}`,
      })),
    });

    // Color (usar tipo 'color' según el frontend)
    attributes.push({
      id: `attr-${Date.now()}-2`,
      name: 'color',
      type: 'color',
      required: true,
      variants: typeConfig.colors.slice(0, 3).map((color, idx) => ({
        id: `var-${Date.now()}-${idx + 10}`,
        name: color,
        value: color,
        stock: randomInt(5, 30),
        sku: `C-${color.substring(0, 2).toUpperCase()}`,
      })),
    });
  } else if (productType === 'zarcillos') {
    // Tipo (usar tipo 'select' según el frontend)
    attributes.push({
      id: `attr-${Date.now()}-1`,
      name: 'tipo',
      type: 'select',
      required: true,
      variants: typeConfig.types.slice(0, 3).map((type, idx) => ({
        id: `var-${Date.now()}-${idx}`,
        name: type,
        value: type,
        stock: randomInt(5, 35),
        sku: `T-${type.substring(0, 2).toUpperCase()}`,
      })),
    });

    // Color (usar tipo 'color' según el frontend)
    attributes.push({
      id: `attr-${Date.now()}-2`,
      name: 'color',
      type: 'color',
      required: true,
      variants: typeConfig.colors.slice(0, 3).map((color, idx) => ({
        id: `var-${Date.now()}-${idx + 10}`,
        name: color,
        value: color,
        stock: randomInt(5, 30),
        sku: `C-${color.substring(0, 2).toUpperCase()}`,
      })),
    });
  }

  return attributes;
}

// Función para calcular el stock total basado en variantes
function calculateTotalStock(attributes) {
  if (!attributes || attributes.length === 0) return randomInt(10, 100);
  
  let totalStock = 0;
  attributes.forEach(attr => {
    if (attr.variants && Array.isArray(attr.variants)) {
      attr.variants.forEach(variant => {
        totalStock += variant.stock || 0;
      });
    }
  });
  
  return totalStock > 0 ? totalStock : randomInt(10, 100);
}

async function createTestProducts() {
  console.log('🚀 Iniciando creación de productos de prueba\n');

  const client = createDirectClient();

  try {
    await client.connect();
    console.log('✅ Conectado a la base de datos\n');

    await client.query('BEGIN');

    try {
      // Obtener o crear una tienda
      let storeResult = await client.query(
        "SELECT id, created_by FROM stores WHERE state = 'active' LIMIT 1"
      );

      let storeId, userId;

      if (storeResult.rows.length === 0) {
        // Obtener un usuario admin o crear uno
        let userResult = await client.query(
          "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
        );

        if (userResult.rows.length === 0) {
          throw new Error('No hay usuarios en la base de datos. Por favor crea un usuario primero.');
        }

        userId = userResult.rows[0].id;

        // Crear una tienda de prueba
        const newStoreResult = await client.query(
          `INSERT INTO stores (name, state, created_by)
           VALUES ($1, $2, $3)
           RETURNING id`,
          ['Tienda de Prueba', 'active', userId]
        );
        storeId = newStoreResult.rows[0].id;
        console.log(`✅ Tienda creada: ${storeId}\n`);
      } else {
        storeId = storeResult.rows[0].id;
        userId = storeResult.rows[0].created_by;
        console.log(`✅ Usando tienda existente: ${storeId}\n`);
      }

      // Crear o obtener categorías
      const categoriesMap = {};

      for (const [productType, config] of Object.entries(PRODUCT_TYPES)) {
        let categoryResult = await client.query(
          'SELECT id FROM categories WHERE store_id = $1 AND slug = $2',
          [storeId, config.categorySlug]
        );

        if (categoryResult.rows.length === 0) {
          const newCategoryResult = await client.query(
            `INSERT INTO categories (name, slug, store_id, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [config.categoryName, config.categorySlug, storeId, userId]
          );
          categoriesMap[productType] = newCategoryResult.rows[0].id;
          console.log(`✅ Categoría creada: ${config.categoryName} (${config.categorySlug})`);
        } else {
          categoriesMap[productType] = categoryResult.rows[0].id;
          console.log(`✅ Categoría encontrada: ${config.categoryName} (${config.categorySlug})`);
        }
      }

      console.log('\n📦 Creando productos...\n');

      let productCount = 0;
      const productsPerType = 25;

      for (const [productType, config] of Object.entries(PRODUCT_TYPES)) {
        const categoryId = categoriesMap[productType];

        for (let i = 0; i < productsPerType; i++) {
          const baseName = config.baseNames[i];
          const basePrice = randomInt(config.basePriceRange.min, config.basePriceRange.max);
          const attributes = generateAttributes(productType, config);
          const totalStock = calculateTotalStock(attributes);
          const sku = generateSKU(productType, i);
          
          // Generar descripción
          const material = randomItem(config.materials);
          const description = `${baseName} de ${material}. Diseño elegante y moderno, perfecto para cualquier ocasión. Calidad premium garantizada.`;

          // Generar tags
          const tags = [
            productType,
            material.toLowerCase(),
            'joyería',
            'accesorios',
            'premium',
            'elegante',
          ];

          // Rating aleatorio (opcional)
          const rating = Math.random() > 0.3 ? parseFloat((Math.random() * 2 + 3).toFixed(2)) : null;
          const reviewCount = rating ? randomInt(5, 150) : 0;

          try {
            await client.query(
              `INSERT INTO products (
                name, description, base_price, currency, stock, sku,
                category_id, store_id, created_by, images, attributes,
                rating, review_count, tags
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
              [
                baseName,
                description,
                basePrice,
                'USD',
                totalStock,
                sku,
                categoryId,
                storeId,
                userId,
                JSON.stringify([config.image]),
                JSON.stringify(attributes),
                rating,
                reviewCount,
                JSON.stringify(tags),
              ]
            );

            productCount++;
            if (productCount % 10 === 0) {
              console.log(`   ✅ ${productCount} productos creados...`);
            }
          } catch (error) {
            console.error(`   ❌ Error creando producto ${baseName}:`, error.message);
            // Continuar con el siguiente producto
          }
        }
      }

      await client.query('COMMIT');
      console.log(`\n✅ Transacción completada exitosamente`);
      console.log(`\n📊 Resumen:`);
      console.log(`   - Total de productos creados: ${productCount}`);
      console.log(`   - Tienda: ${storeId}`);
      console.log(`   - Categorías utilizadas: ${Object.keys(categoriesMap).length}`);
      console.log(`\n✅ Script completado exitosamente!`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('\n❌ Error en el script:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Conexión cerrada');
  }
}

createTestProducts();
