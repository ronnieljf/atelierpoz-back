/**
 * Script para crear un usuario inicial, tienda y relación store_users
 * Ejecutar con: node src/db/seed.js
 */

import bcrypt from 'bcryptjs';
import { createDirectClient } from '../config/database.js';

async function seed() {
  console.log('🌱 Iniciando seeder...\n');

  const client = createDirectClient();

  try {
    // Conectar
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    const email = 'admin@atelierpoz.com';
    const password = 'admin123';
    const name = 'Administrador Principal';
    const storeName = 'Tienda Principal';
    const storeState = 'active';

    // Iniciar transacción
    await client.query('BEGIN');

    try {
      // 1. Verificar o crear usuario
      let userId;
      let userCreated = false;

      const existingUserResult = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUserResult.rows.length > 0) {
        userId = existingUserResult.rows[0].id;
        console.log('✅ Usuario ya existe:', email);
        console.log(`   ID: ${userId}`);
      } else {
        // Hash de la contraseña
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Crear usuario
        const userResult = await client.query(
          `INSERT INTO users (email, password_hash, name, role)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, name, role`,
          [email, passwordHash, name, 'admin']
        );

        const user = userResult.rows[0];
        userId = user.id;
        userCreated = true;

        console.log('✅ Usuario creado exitosamente:');
        console.log(`   ID: ${user.id}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Nombre: ${user.name}`);
        console.log(`   Rol: ${user.role}`);
        console.log(`   Contraseña: ${password}`);
      }

      // 2. Verificar o crear tienda
      let storeId;
      let storeCreated = false;

      const existingStoreResult = await client.query(
        'SELECT id FROM stores WHERE created_by = $1 AND name = $2',
        [userId, storeName]
      );

      if (existingStoreResult.rows.length > 0) {
        storeId = existingStoreResult.rows[0].id;
        console.log('\n✅ Tienda ya existe:', storeName);
        console.log(`   ID: ${storeId}`);
      } else {
        // Crear tienda
        const storeResult = await client.query(
          `INSERT INTO stores (name, state, created_by)
           VALUES ($1, $2, $3)
           RETURNING id, name, state`,
          [storeName, storeState, userId]
        );

        const store = storeResult.rows[0];
        storeId = store.id;
        storeCreated = true;

        console.log('\n✅ Tienda creada exitosamente:');
        console.log(`   ID: ${store.id}`);
        console.log(`   Nombre: ${store.name}`);
        console.log(`   Estado: ${store.state}`);
      }

      // 3. Verificar o crear relación store_users
      const existingRelationResult = await client.query(
        'SELECT id FROM store_users WHERE store_id = $1 AND user_id = $2',
        [storeId, userId]
      );

      if (existingRelationResult.rows.length > 0) {
        console.log('\n✅ Relación store_users ya existe');
        console.log(`   ID: ${existingRelationResult.rows[0].id}`);
      } else {
        // Crear relación store_users
        const relationResult = await client.query(
          `INSERT INTO store_users (store_id, user_id, is_creator)
           VALUES ($1, $2, $3)
           RETURNING id, store_id, user_id, is_creator`,
          [storeId, userId, true]
        );

        const relation = relationResult.rows[0];

        console.log('\n✅ Relación store_users creada exitosamente:');
        console.log(`   ID: ${relation.id}`);
        console.log(`   Store ID: ${relation.store_id}`);
        console.log(`   User ID: ${relation.user_id}`);
        console.log(`   Es Creador: ${relation.is_creator}`);
      }

      // 4. Crear categorías por defecto
      const defaultCategories = [
        { name: 'Anillos', slug: 'rings' },
        { name: 'Collares', slug: 'necklaces' },
        { name: 'Pulseras', slug: 'bracelets' },
        { name: 'Aretes', slug: 'earrings' },
        { name: 'Relojes', slug: 'watches' },
      ];

      let categoriesCreated = 0;
      for (const category of defaultCategories) {
        const existingCategoryResult = await client.query(
          'SELECT id FROM categories WHERE store_id = $1 AND slug = $2',
          [storeId, category.slug]
        );

        if (existingCategoryResult.rows.length === 0) {
          await client.query(
            `INSERT INTO categories (name, slug, store_id, created_by)
             VALUES ($1, $2, $3, $4)`,
            [category.name, category.slug, storeId, userId]
          );
          categoriesCreated++;
          console.log(`\n✅ Categoría creada: ${category.name} (${category.slug})`);
        }

      }

      if (categoriesCreated === 0) {
        console.log('\n✅ Todas las categorías ya existen');
      } else {
        console.log(`\n✅ ${categoriesCreated} categoría(s) creada(s)`);
      }

      // Commit de la transacción
      await client.query('COMMIT');

      console.log('\n✅ Seeder completado exitosamente!');
      console.log('\n📊 Resumen:');
      console.log(`   Usuario: ${userCreated ? 'Creado' : 'Ya existía'} - ${email}`);
      console.log(`   Tienda: ${storeCreated ? 'Creada' : 'Ya existía'} - ${storeName}`);
      console.log(`   Relación: Creada/Verificada`);
      console.log(`   Categorías: ${categoriesCreated > 0 ? `${categoriesCreated} creadas` : 'Ya existían'}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('\n❌ Error en seeder:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Conexión cerrada');
  }
}

seed();
