/**
 * Script de migración para renombrar status 'draft' a 'hidden'
 * 
 * Este cambio unifica la terminología: 'hidden' describe mejor el comportamiento
 * de actividades no visibles para estudiantes.
 *
 * Ejecutar con: npx tsx scripts/migrate-draft-to-hidden.ts
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'sapin.db');

async function migrate() {
    console.log('🚀 Iniciando migración: draft → hidden...\n');

    const db = new Database(DB_PATH);

    try {
        // Verificar registros actuales con status 'draft'
        const countBefore = db.prepare(
            `SELECT COUNT(*) as count FROM interactive_learning WHERE status = 'draft'`
        ).get() as { count: number };

        console.log(`📊 Registros con status 'draft': ${countBefore.count}`);

        if (countBefore.count === 0) {
            console.log('✅ No hay registros para migrar. La base de datos ya está actualizada.');
            return;
        }

        // Actualizar todos los registros de 'draft' a 'hidden'
        const result = db.prepare(
            `UPDATE interactive_learning SET status = 'hidden' WHERE status = 'draft'`
        ).run();

        console.log(`✅ Actualizados ${result.changes} registros de 'draft' a 'hidden'`);

        // Verificar resultado
        const countAfter = db.prepare(
            `SELECT COUNT(*) as count FROM interactive_learning WHERE status = 'draft'`
        ).get() as { count: number };

        const countHidden = db.prepare(
            `SELECT COUNT(*) as count FROM interactive_learning WHERE status = 'hidden'`
        ).get() as { count: number };

        console.log(`\n📊 Verificación:`);
        console.log(`   - Registros con status 'draft': ${countAfter.count}`);
        console.log(`   - Registros con status 'hidden': ${countHidden.count}`);

        console.log('\n✅ Migración completada exitosamente!');

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        throw error;
    } finally {
        db.close();
    }
}

migrate().catch(console.error);
