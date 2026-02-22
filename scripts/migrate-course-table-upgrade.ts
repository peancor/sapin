/**
 * Script de migración para upgrade de la tabla course
 *
 * Cambios:
 * - Añade: slug (único), status, publishedAt, archivedAt, createdAt, updatedAt, settings, metadata
 * - Elimina: llm_role, llm_instructions, context (ya están en interactive_learning_chat)
 * - Añade índices: course_slug_idx, course_status_idx
 *
 * Ejecutar con: npx tsx scripts/migrate-course-table-upgrade.ts
 */

import Database from 'better-sqlite3';

const DB_PATH = process.env.DATABASE_URL || './sapin.db';

interface OldCourse {
    id: string;
    name: string;
    description: string | null;
    image: string | null;
    llm_role: string | null;
    llm_instructions: string | null;
    context: string | null;
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
        slug = 'curso';
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
    console.log('🚀 Iniciando migración de la tabla course...');
    console.log(`📁 Base de datos: ${DB_PATH}`);

    const db = new Database(DB_PATH);

    try {
        // 1. Verificar estructura actual
        console.log('\n📋 Verificando estructura actual de la tabla course...');
        const tableInfo = db.prepare(`PRAGMA table_info(course)`).all() as Array<{ name: string }>;
        const existingColumns = new Set(tableInfo.map(col => col.name));

        console.log(`   Columnas actuales: ${[...existingColumns].join(', ')}`);

        // 2. Leer datos existentes
        console.log('\n📖 Leyendo cursos existentes...');
        const courses = db.prepare(`SELECT * FROM course`).all() as OldCourse[];
        console.log(`   Encontrados: ${courses.length} cursos`);

        // 3. Crear tabla temporal con nueva estructura
        console.log('\n🔨 Creando tabla temporal con nueva estructura...');

        // Drop si existe de una ejecución anterior fallida
        db.exec(`DROP TABLE IF EXISTS course_new`);

        db.exec(`
            CREATE TABLE course_new (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                description TEXT,
                image TEXT,
                status TEXT NOT NULL DEFAULT 'draft',
                published_at INTEGER,
                archived_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                settings TEXT,
                metadata TEXT
            )
        `);

        // 4. Migrar datos
        console.log('\n📦 Migrando datos...');
        const existingSlugs = new Set<string>();
        const now = Date.now();

        const insertStmt = db.prepare(`
            INSERT INTO course_new (id, name, slug, description, image, status, published_at, archived_at, created_at, updated_at, settings, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const course of courses) {
            const slug = generateSlug(course.name, existingSlugs);
            existingSlugs.add(slug);

            // Todos los cursos existentes se marcan como published (ya estaban en uso)
            insertStmt.run(
                course.id,
                course.name,
                slug,
                course.description,
                course.image,
                'published', // status
                now,         // published_at
                null,        // archived_at
                now,         // created_at
                now,         // updated_at
                null,        // settings
                null         // metadata
            );

            console.log(`   ✅ ${course.name} -> slug: "${slug}"`);
        }

        // 5. Reemplazar tabla original
        console.log('\n🔄 Reemplazando tabla original...');

        // Desactivar foreign keys temporalmente para poder hacer el reemplazo
        db.exec(`PRAGMA foreign_keys = OFF`);

        db.exec(`
            DROP TABLE course;
            ALTER TABLE course_new RENAME TO course;
        `);

        // Reactivar foreign keys
        db.exec(`PRAGMA foreign_keys = ON`);

        // 6. Crear índices
        console.log('\n📇 Creando índices...');
        db.exec(`
            CREATE INDEX IF NOT EXISTS course_slug_idx ON course(slug);
            CREATE INDEX IF NOT EXISTS course_status_idx ON course(status);
        `);

        // 7. Verificar migración
        console.log('\n✔️  Verificando migración...');
        const newTableInfo = db.prepare(`PRAGMA table_info(course)`).all() as Array<{ name: string }>;
        const newColumns = newTableInfo.map(col => col.name);
        console.log(`   Nuevas columnas: ${newColumns.join(', ')}`);

        const courseCount = db.prepare(`SELECT COUNT(*) as count FROM course`).get() as { count: number };
        console.log(`   Total cursos migrados: ${courseCount.count}`);

        // Verificar que los campos LLM fueron eliminados
        const hasLlmRole = newColumns.includes('llm_role');
        const hasLlmInstructions = newColumns.includes('llm_instructions');
        const hasContext = newColumns.includes('context');

        if (!hasLlmRole && !hasLlmInstructions && !hasContext) {
            console.log('   ✅ Campos LLM eliminados correctamente');
        } else {
            console.log('   ⚠️  Algunos campos LLM aún existen');
        }

        console.log('\n✨ Migración completada exitosamente!');
        console.log('\n📝 Notas:');
        console.log('   - Todos los cursos existentes fueron marcados como "published"');
        console.log('   - Los slugs fueron generados automáticamente desde los nombres');
        console.log('   - Los campos llm_role, llm_instructions y context fueron eliminados');
        console.log('   - La configuración de IA ahora debe estar en interactive_learning_chat');

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

migrate();
