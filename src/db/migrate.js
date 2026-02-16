/**
 * Script de migración para crear las tablas en la base de datos
 * Ejecutar con: npm run migrate
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDirectClient } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  console.log('🚀 Iniciando migración...\n');

  const client = createDirectClient();

  try {
    // Conectar al cliente directo
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado exitosamente\n');

    // Leer el archivo SQL
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    console.log('📝 Ejecutando schema completo...\n');

    // Ejecutar statements uno por uno dentro de una transacción
    await client.query('BEGIN');
    
    try {
      // Dividir el schema en líneas y procesar
      const lines = schema.split('\n');
      let currentStatement = '';
      const statements = [];

      for (const line of lines) {
        const trimmed = line.trim();
        
        // Saltar comentarios y líneas vacías
        if (!trimmed || trimmed.startsWith('--')) {
          continue;
        }

        currentStatement += line + '\n';

        // Si la línea termina con punto y coma, es el final de un statement
        if (trimmed.endsWith(';')) {
          const stmt = currentStatement.trim();
          if (stmt.length > 0) {
            statements.push(stmt);
          }
          currentStatement = '';
        }
      }

      // Agregar el último statement si no termina con punto y coma
      if (currentStatement.trim().length > 0) {
        statements.push(currentStatement.trim());
      }

      console.log(`📋 Ejecutando ${statements.length} statements...\n`);

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement) {
          try {
            await client.query(statement);
            // Mostrar preview del statement
            const firstLine = statement.split('\n').find(l => l.trim().length > 0) || '';
            const preview = firstLine.substring(0, 70).trim();
            console.log(`✅ [${i + 1}/${statements.length}] ${preview}...`);
          } catch (error) {
            // Si es un error de "already exists", continuar
            if (error.code === '42P07' || error.message.includes('already exists')) {
              const firstLine = statement.split('\n').find(l => l.trim().length > 0) || '';
              const preview = firstLine.substring(0, 70).trim();
              console.log(`⚠️  [${i + 1}/${statements.length}] ${preview}... (ya existe)`);
            } else {
              // Para otros errores, mostrar más detalles y hacer rollback
              console.error(`\n❌ Error en statement ${i + 1}:`);
              const firstLine = statement.split('\n').find(l => l.trim().length > 0) || '';
              console.error(`   Statement: ${firstLine.substring(0, 100)}...`);
              console.error(`   Error: ${error.message}`);
              console.error(`   Código: ${error.code}`);
              if (error.position) {
                console.error(`   Posición: ${error.position}`);
              }
              await client.query('ROLLBACK');
              throw error;
            }
          }
        }
      }
      
      await client.query('COMMIT');
      console.log('\n✅ Transacción completada exitosamente');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    console.log('\n✅ Migración completada exitosamente!');
    console.log('\n📊 Tablas creadas:');
    console.log('   - users');
    console.log('   - sessions');
    console.log('   - stores');
    console.log('   - store_users');
  } catch (error) {
    console.error('\n❌ Error en la migración:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
    if (error.position) {
      console.error(`   Posición: ${error.position}`);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Conexión cerrada');
  }
}

migrate();
