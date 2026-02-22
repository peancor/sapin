/**
 * Script de migración para upgrade de la tabla interactive_learning
 *
 * Cambios:
 * - Añade: slug (único), status, publishedAt, archivedAt, metadata
 * - Elimina: is_active
 * - Añade índices: interactive_learning_slug_idx, interactive_learning_status_idx
 *
 * Mapeo de datos:
 * - is_active = true → status = 'published'
 * - is_active = false → status = 'draft'
 *
 * Ejecutar con: npx tsx scripts/migrate-interactive-learning-upgrade.ts
 */

import Database from 'better-sqlite3';

const DB_PATH = process.env.DATABASE_URL || './sapin.db';

interface OldInteractiveLearning {
    id: string;
    name: string;
    description: string | null;
    image: string | null;
    type: string;
    content: string;
    created_at: number;
    updated_at: number;
    is_active: number; // SQLite integer boolean
}

function generateSlug(name: string, existingSlugs: Set<string>): string {
    // Genera slug base desde el nombre
    let slug = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Elimina acentos
        .replace(/[^a-z0-9\s-]/g, '') // Solo alfanumérico, espacios y guiones
        .replace(/\s+/g, '-') // Espacios a guiones
        .replace(/-+/g, '-') // Múltiples guiones a uno
        .replace(/^-|-$/g, '') // Elimina guiones al inicio/fin
        .substring(0, 60); // Limita longitud

    if (!slug) {
        slug = 'actividad';
    }

    // Asegura unicidad
    let finalSlug = slug;
    let counter = 1;
    while (existingSlugs.has(finalSlug)) {
        finalSlug = `${slug}-${counter}`;
        counter++;
    }

    return finalSlug;
}

async function migrate() {
    console.log('🚀 Iniciando migración de la tabla interactive_learning...');
    console.log(`📁 Base de datos: ${DB_PATH}`);

    const db = new Database(DB_PATH);

    try {
        // 1. Verificar estructura actual
        console.log('\n📋 Verificando estructura actual de la tabla interactive_learning...');
        const tableInfo = db.prepare(`PRAGMA table_info(interactive_learning)`).all() as Array<{ name: string }>;
        const existingColumns = new Set(tableInfo.map(col => col.name));

        console.log(`   Columnas actuales: ${[...existingColumns].join(', ')}`);

        // Verificar si ya tiene slug (ya migrada)
        if (existingColumns.has('slug')) {
            console.log('\n⚠️  La tabla ya tiene el campo slug. Parece que ya fue migrada.');
            console.log('   Si deseas ejecutar la migración nuevamente, restaura primero la base de datos.');
            process.exit(0);
        }

        // 2. Leer datos existentes
        console.log('\n📖 Leyendo actividades existentes...');
        const activities = db.prepare(`SELECT * FROM interactive_learning`).all() as OldInteractiveLearning[];
        console.log(`   Encontradas: ${activities.length} actividades`);

        // 3. Crear tabla temporal con nueva estructura
        console.log('\n🔨 Creando tabla temporal con nueva estructura...');

        // Drop si existe de una ejecución anterior fallida
        db.exec(`DROP TABLE IF EXISTS interactive_learning_new`);

        db.exec(`
            CREATE TABLE interactive_learning_new (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                description TEXT,
                image TEXT,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                published_at INTEGER,
                archived_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT
            )
        `);

        // 4. Migrar datos
        console.log('\n📦 Migrando datos...');
        const existingSlugs = new Set<string>();
        const now = Date.now();

        const insertStmt = db.prepare(`
            INSERT INTO interactive_learning_new (
                id, name, slug, description, image, type, content,
                status, published_at, archived_at, created_at, updated_at, metadata
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let publishedCount = 0;
        let draftCount = 0;

        for (const activity of activities) {
            const slug = generateSlug(activity.name, existingSlugs);
            existingSlugs.add(slug);

            // Mapear is_active a status
            const wasActive = activity.is_active === 1;
            const status = wasActive ? 'published' : 'draft';

            if (wasActive) {
                publishedCount++;
            } else {
                draftCount++;
            }

            insertStmt.run(
                activity.id,
                activity.name,
                slug,
                activity.description,
                activity.image,
                activity.type,
                activity.content,
                status,
                wasActive ? activity.created_at || now : null, // published_at
                null,                                           // archived_at
                activity.created_at || now,                     // created_at
                activity.updated_at || now,                     // updated_at
                null                                            // metadata
            );

            const statusIcon = wasActive ? '✅' : '📝';
            console.log(`   ${statusIcon} ${activity.name} -> slug: "${slug}", status: ${status}`);
        }

        // 5. Reemplazar tabla original
        console.log('\n🔄 Reemplazando tabla original...');

        // Desactivar foreign keys temporalmente para poder hacer el reemplazo
        db.exec(`PRAGMA foreign_keys = OFF`);

        db.exec(`
            DROP TABLE interactive_learning;
            ALTER TABLE interactive_learning_new RENAME TO interactive_learning;
        `);

        // Reactivar foreign keys
        db.exec(`PRAGMA foreign_keys = ON`);

        // 6. Crear índices
        console.log('\n📇 Creando índices...');
        db.exec(`
            CREATE INDEX IF NOT EXISTS interactive_learning_slug_idx ON interactive_learning(slug);
            CREATE INDEX IF NOT EXISTS interactive_learning_status_idx ON interactive_learning(status);
        `);

        // 7. Verificar migración
        console.log('\n✔️  Verificando migración...');
        const newTableInfo = db.prepare(`PRAGMA table_info(interactive_learning)`).all() as Array<{ name: string }>;
        const newColumns = newTableInfo.map(col => col.name);
        console.log(`   Nuevas columnas: ${newColumns.join(', ')}`);

        const activityCount = db.prepare(`SELECT COUNT(*) as count FROM interactive_learning`).get() as { count: number };
        console.log(`   Total actividades migradas: ${activityCount.count}`);

        // Verificar que is_active fue eliminado
        const hasIsActive = newColumns.includes('is_active');
        const hasSlug = newColumns.includes('slug');
        const hasStatus = newColumns.includes('status');

        if (!hasIsActive && hasSlug && hasStatus) {
            console.log('   ✅ Campo is_active eliminado correctamente');
            console.log('   ✅ Campos slug y status añadidos correctamente');
        } else {
            console.log('   ⚠️  Verificación de campos no coincide con lo esperado');
        }

        console.log('\n✨ Migración completada exitosamente!');
        console.log('\n📊 Resumen:');
        console.log(`   - ${publishedCount} actividades marcadas como "published" (antes is_active=true)`);
        console.log(`   - ${draftCount} actividades marcadas como "draft" (antes is_active=false)`);
        console.log('\n📝 Notas:');
        console.log('   - Los slugs fueron generados automáticamente desde los nombres');
        console.log('   - El campo is_active fue eliminado y reemplazado por status');
        console.log('   - Las actividades activas mantienen su visibilidad como "published"');
        console.log('   - Las actividades inactivas son ahora "draft" (editables pero no visibles)');

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

migrate();
