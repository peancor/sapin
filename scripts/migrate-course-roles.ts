/**
 * Script de migración de roles de curso
 * Migra datos de course_enrollment y course_teacher al nuevo sistema course_role
 * 
 * Ejecutar con: npx tsx scripts/migrate-course-roles.ts
 */

import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

const DB_PATH = process.env.DATABASE_URL || './sapin.db';

interface CourseEnrollment {
    id: string;
    course_id: string;
    user_id: string;
    is_active: number;
}

interface CourseTeacher {
    id: string;
    course_id: string;
    teacher_id: string;
    created_at: number;
}

interface ExistingCourseRole {
    course_id: string;
    user_id: string;
    role: string;
}

async function migrate() {
    console.log('🚀 Iniciando migración de roles de curso...');
    console.log(`📁 Base de datos: ${DB_PATH}`);

    const db = new Database(DB_PATH);

    try {
        // Obtener roles existentes para evitar duplicados
        const existingRoles = db.prepare(`
            SELECT course_id, user_id, role FROM course_role WHERE is_active = 1
        `).all() as ExistingCourseRole[];

        const existingRolesSet = new Set(
            existingRoles.map(r => `${r.course_id}:${r.user_id}:${r.role}`)
        );

        console.log(`📊 Roles existentes en course_role: ${existingRoles.length}`);

        // Migrar course_teacher -> role 'teacher'
        console.log('\n📚 Migrando course_teacher -> teacher...');
        const teachers = db.prepare(`
            SELECT id, course_id, teacher_id, created_at FROM course_teacher
        `).all() as CourseTeacher[];

        let teachersMigrated = 0;
        let teachersSkipped = 0;

        const insertStmt = db.prepare(`
            INSERT INTO course_role (id, course_id, user_id, role, permissions, assigned_by, assigned_at, is_active)
            VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)
        `);

        for (const teacher of teachers) {
            const key = `${teacher.course_id}:${teacher.teacher_id}:teacher`;
            if (existingRolesSet.has(key)) {
                teachersSkipped++;
                continue;
            }

            try {
                insertStmt.run(
                    nanoid(),
                    teacher.course_id,
                    teacher.teacher_id,
                    'teacher',
                    teacher.created_at || Date.now()
                );
                teachersMigrated++;
                existingRolesSet.add(key);
            } catch (error) {
                console.error(`  ❌ Error migrando teacher ${teacher.teacher_id} en curso ${teacher.course_id}:`, error);
            }
        }

        console.log(`  ✅ Profesores migrados: ${teachersMigrated}`);
        console.log(`  ⏭️  Profesores omitidos (ya existían): ${teachersSkipped}`);

        // Migrar course_enrollment -> role 'student'
        console.log('\n👨‍🎓 Migrando course_enrollment -> student...');
        const enrollments = db.prepare(`
            SELECT id, course_id, user_id, is_active FROM course_enrollment
        `).all() as CourseEnrollment[];

        let studentsMigrated = 0;
        let studentsSkipped = 0;
        let studentsInactive = 0;

        for (const enrollment of enrollments) {
            // Si el enrollment está inactivo, lo migramos como inactivo
            if (!enrollment.is_active) {
                studentsInactive++;
                continue;
            }

            const key = `${enrollment.course_id}:${enrollment.user_id}:student`;
            if (existingRolesSet.has(key)) {
                studentsSkipped++;
                continue;
            }

            // Verificar si el usuario ya tiene un rol más alto en el curso
            const hasHigherRole = existingRolesSet.has(`${enrollment.course_id}:${enrollment.user_id}:teacher`) ||
                                  existingRolesSet.has(`${enrollment.course_id}:${enrollment.user_id}:owner`) ||
                                  existingRolesSet.has(`${enrollment.course_id}:${enrollment.user_id}:admin`);

            if (hasHigherRole) {
                studentsSkipped++;
                continue;
            }

            try {
                insertStmt.run(
                    nanoid(),
                    enrollment.course_id,
                    enrollment.user_id,
                    'student',
                    Date.now()
                );
                studentsMigrated++;
                existingRolesSet.add(key);
            } catch (error) {
                console.error(`  ❌ Error migrando student ${enrollment.user_id} en curso ${enrollment.course_id}:`, error);
            }
        }

        console.log(`  ✅ Estudiantes migrados: ${studentsMigrated}`);
        console.log(`  ⏭️  Estudiantes omitidos (ya existían o tienen rol superior): ${studentsSkipped}`);
        console.log(`  ⚠️  Enrollments inactivos no migrados: ${studentsInactive}`);

        // Resumen final
        const totalRoles = db.prepare(`SELECT COUNT(*) as count FROM course_role WHERE is_active = 1`).get() as { count: number };

        console.log('\n📈 Resumen de migración:');
        console.log(`  - Total profesores migrados: ${teachersMigrated}`);
        console.log(`  - Total estudiantes migrados: ${studentsMigrated}`);
        console.log(`  - Total roles activos en course_role: ${totalRoles.count}`);

        console.log('\n✨ Migración completada exitosamente!');

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

migrate();
