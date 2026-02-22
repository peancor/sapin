/**
 * Script de migración para añadir columna closed_at a interactive_learning
 *
 * Esta migración es ligera - solo añade una nueva columna.
 * No requiere recrear la tabla ni migrar datos.
 *
 * Ejecutar con: npx tsx scripts/migrate-add-closed-status.ts
 */

import Database from 'better-sqlite3';

const DB_PATH = process.env.DATABASE_URL || './sapin.db';

async function migrate() {
    console.log('🚀 Iniciando migración: añadir columna closed_at...');
    console.log(`📁 Base de datos: ${DB_PATH}`);

    const db = new Database(DB_PATH);

    try {
        // 1. Verificar estructura actual
        console.log('\n📋 Verificando estructura actual de la tabla interactive_learning...');
        const tableInfo = db.prepare(`PRAGMA table_info(interactive_learning)`).all() as Array<{ name: string }>;
        const existingColumns = new Set(tableInfo.map(col => col.name));

        console.log(`   Columnas actuales: ${[...existingColumns].join(', ')}`);

        // Verificar si ya tiene closed_at (ya migrada)
        if (existingColumns.has('closed_at')) {
            console.log('\n⚠️  La tabla ya tiene el campo closed_at. Migración no necesaria.');
            process.exit(0);
        }

        // Verificar que tiene las columnas del ciclo de vida anterior
        if (!existingColumns.has('status') || !existingColumns.has('slug')) {
            console.log('\n❌ Error: La tabla no tiene los campos de ciclo de vida (status, slug).');
            console.log('   Ejecuta primero: npx tsx scripts/migrate-interactive-learning-upgrade.ts');
            process.exit(1);
        }

        // 2. Añadir columna closed_at
        console.log('\n🔨 Añadiendo columna closed_at...');
        db.exec(`
            ALTER TABLE interactive_learning 
            ADD COLUMN closed_at INTEGER
        `);

        console.log('   ✅ Columna closed_at añadida correctamente');

        // 3. Verificar migración
        console.log('\n✔️  Verificando migración...');
        const newTableInfo = db.prepare(`PRAGMA table_info(interactive_learning)`).all() as Array<{ name: string }>;
        const newColumns = new Set(newTableInfo.map(col => col.name));

        if (newColumns.has('closed_at')) {
            console.log('   ✅ Columna closed_at existe');
        } else {
            console.log('   ❌ Error: La columna closed_at no fue añadida');
            process.exit(1);
        }

        console.log('\n✨ Migración completada exitosamente!');
        console.log('\n📝 Notas:');
        console.log('   - Nuevo estado "closed" disponible para actividades');
        console.log('   - Actividades cerradas son visibles para estudiantes pero no permiten nuevas interacciones');
        console.log('   - closed_at registra cuándo se cerró la actividad');

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

migrate();
