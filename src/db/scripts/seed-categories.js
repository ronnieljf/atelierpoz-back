/**
 * Seeder: Crear categorías globales
 * Ejecutar con: node src/db/scripts/seed-categories.js
 *             o: npm run seed:categories
 *
 * Incluye categorías detalladas de:
 * - Ropa (mujer, hombre, infantil, deportiva, vestidos, blusas, etc.)
 * - Accesorios (bolsos, cinturones, gorros, gafas, etc.)
 * - Cuidado personal (piel, cabello, higiene, fragancias, etc.)
 * - Belleza (maquillaje, uñas, herramientas, tratamientos, etc.)
 * - Relojes (hombre, mujer, deportivos, inteligentes, etc.)
 * - Joyería (anillos, collares, pulseras, aretes, oro, plata, etc.)
 */

import { createDirectClient } from '../../config/database.js';

const CATEGORIES = [
  // ─── Ropa ─────────────────────────────────────────────────────────────
  { name: 'Ropa', slug: 'ropa' },
  { name: 'Ropa de mujer', slug: 'ropa-mujer' },
  { name: 'Ropa de hombre', slug: 'ropa-hombre' },
  { name: 'Ropa infantil', slug: 'ropa-infantil' },
  { name: 'Ropa deportiva', slug: 'ropa-deportiva' },
  { name: 'Vestidos', slug: 'vestidos' },
  { name: 'Blusas y camisas', slug: 'blusas-camisas' },
  { name: 'Pantalones y jeans', slug: 'pantalones-jeans' },
  { name: 'Faldas', slug: 'faldas' },
  { name: 'Chaquetas y abrigos', slug: 'chaquetas-abrigos' },
  { name: 'Ropa interior y lencería', slug: 'ropa-interior-lenceria' },
  { name: 'Trajes de baño', slug: 'trajes-bano' },
  { name: 'Sudaderas y hoodies', slug: 'sudaderas-hoodies' },
  { name: 'Shorts y bermudas', slug: 'shorts-bermudas' },

  // ─── Accesorios ────────────────────────────────────────────────────────
  { name: 'Accesorios', slug: 'accesorios' },
  { name: 'Bolsos y carteras', slug: 'bolsos-carteras' },
  { name: 'Mochilas', slug: 'mochilas' },
  { name: 'Cinturones', slug: 'cinturones' },
  { name: 'Gorros y sombreros', slug: 'gorros-sombreros' },
  { name: 'Bufandas y pañuelos', slug: 'bufandas-panuelos' },
  { name: 'Guantes', slug: 'guantes' },
  { name: 'Gafas de sol', slug: 'gafas-sol' },
  { name: 'Gafas ópticas', slug: 'gafas-opticas' },
  { name: 'Medias y calcetines', slug: 'medias-calcetines' },
  { name: 'Corbatas y pajaritas', slug: 'corbatas-pajaritas' },
  { name: 'Paraguas', slug: 'paraguas' },

  // ─── Cuidado personal ──────────────────────────────────────────────────
  { name: 'Productos de cuidado personal', slug: 'cuidado-personal' },
  { name: 'Cuidado de la piel', slug: 'cuidado-piel' },
  { name: 'Cuidado del cabello', slug: 'cuidado-cabello' },
  { name: 'Higiene bucal', slug: 'higiene-bucal' },
  { name: 'Cuidado corporal', slug: 'cuidado-corporal' },
  { name: 'Fragancias y perfumes', slug: 'fragancias-perfumes' },
  { name: 'Cuidado para hombres', slug: 'cuidado-hombres' },
  { name: 'Cuidado del bebé', slug: 'cuidado-bebe' },
  { name: 'Desodorantes y antitranspirantes', slug: 'desodorantes-antitranspirantes' },
  { name: 'Cremas y lociones', slug: 'cremas-lociones' },
  { name: 'Serums y tratamientos faciales', slug: 'serums-tratamientos-faciales' },
  { name: 'Protector solar', slug: 'protector-solar' },
  { name: 'Champús y acondicionadores', slug: 'champus-acondicionadores' },
  { name: 'Productos para el afeitado', slug: 'productos-afeitado' },

  // ─── Belleza ──────────────────────────────────────────────────────────
  { name: 'Belleza', slug: 'belleza' },
  { name: 'Maquillaje', slug: 'maquillaje' },
  { name: 'Cuidado facial', slug: 'cuidado-facial' },
  { name: 'Cuidado de uñas', slug: 'cuidado-unas' },
  { name: 'Herramientas de belleza', slug: 'herramientas-belleza' },
  { name: 'Tratamientos capilares', slug: 'tratamientos-capilares' },
  { name: 'Depilación y afeitado', slug: 'depilacion-afeitado' },
  { name: 'Productos solares y bronceado', slug: 'solares-bronceado' },
  { name: 'Labiales y brillos', slug: 'labiales-brillos' },
  { name: 'Sombras y delineadores', slug: 'sombras-delineadores' },
  { name: 'Bases y correctores', slug: 'bases-correctores' },
  { name: 'Brochas y esponjas', slug: 'brochas-esponjas' },
  { name: 'Esmaltes de uñas', slug: 'esmaltes-unas' },
  { name: 'Kits de maquillaje', slug: 'kits-maquillaje' },

  // ─── Relojes ───────────────────────────────────────────────────────────
  { name: 'Relojes', slug: 'relojes' },
  { name: 'Relojes de hombre', slug: 'relojes-hombre' },
  { name: 'Relojes de mujer', slug: 'relojes-mujer' },
  { name: 'Relojes deportivos', slug: 'relojes-deportivos' },
  { name: 'Relojes inteligentes', slug: 'relojes-inteligentes' },
  { name: 'Relojes de lujo', slug: 'relojes-lujo' },
  { name: 'Relojes infantiles', slug: 'relojes-infantiles' },
  { name: 'Relojes de pulsera', slug: 'relojes-pulsera' },
  { name: 'Relojes de bolsillo', slug: 'relojes-bolsillo' },
  { name: 'Relojes de pared', slug: 'relojes-pared' },
  { name: 'Pulseras para relojes', slug: 'pulseras-relojes' },

  // ─── Joyería ──────────────────────────────────────────────────────────
  { name: 'Joyería', slug: 'joyeria' },
  { name: 'Anillos', slug: 'anillos' },
  { name: 'Collares', slug: 'collares' },
  { name: 'Pulseras', slug: 'pulseras' },
  { name: 'Aretes y pendientes', slug: 'aretes-pendientes' },
  { name: 'Broches', slug: 'broches' },
  { name: 'Joyería de oro', slug: 'joyeria-oro' },
  { name: 'Joyería de plata', slug: 'joyeria-plata' },
  { name: 'Bisutería', slug: 'bisuteria' },
  { name: 'Joyería con piedras preciosas', slug: 'joyeria-piedras-preciosas' },
  { name: 'Joyería de fantasía', slug: 'joyeria-fantasia' },
  { name: 'Dijes y colgantes', slug: 'dijes-colgantes' },
  { name: 'Tobilleras', slug: 'tobilleras' },
  { name: 'Conjuntos de joyería', slug: 'conjuntos-joyeria' },
];

async function seed() {
  console.log('🌱 Iniciando seeder de categorías...\n');
  console.log(`   Total de categorías a insertar/actualizar: ${CATEGORIES.length}\n`);

  const client = createDirectClient();

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    await client.query('BEGIN');

    const existingSlugs = await client.query(
      'SELECT slug FROM categories WHERE slug = ANY($1::text[])',
      [CATEGORIES.map((c) => c.slug)]
    );
    const existingSet = new Set(existingSlugs.rows.map((r) => r.slug));

    let created = 0;
    let updated = 0;

    for (let i = 0; i < CATEGORIES.length; i++) {
      const { name, slug } = CATEGORIES[i];
      const num = `[${String(i + 1).padStart(2, ' ')}/${CATEGORIES.length}]`;

      const result = await client.query(
        `INSERT INTO categories (name, slug)
         VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id, name, slug`,
        [name, slug]
      );

      const existed = existingSet.has(slug);
      if (existed) {
        updated++;
        console.log(`   ${num} Actualizado: ${name} (${slug})`);
      } else {
        created++;
        console.log(`   ${num} Creado:     ${name} (${slug})`);
      }
    }

    await client.query('COMMIT');

    console.log('\n─────────────────────────────────────────');
    console.log('✅ Seeder de categorías completado');
    console.log(`   Creadas:      ${created}`);
    console.log(`   Actualizadas: ${updated}`);
    console.log(`   Total:        ${CATEGORIES.length}`);
    console.log('─────────────────────────────────────────\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error en el seeder:', error.message);
    if (error.code) console.error('   Código:', error.code);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Conexión cerrada\n');
  }
}

seed();
