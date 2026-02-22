import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, CourseRoleUtils } from '$lib/server/db';
import { course, courseStatus } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const ADMIN_LEVEL = 90;

function checkAdminAccess(locals: App.Locals) {
    if (!locals.user) {
        throw error(401, 'No autenticado');
    }
    if (locals.user.highestRoleLevel < ADMIN_LEVEL) {
        throw error(403, 'Acceso denegado: se requiere rol de administrador');
    }
}

function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 60) || 'curso';
}

export const POST: RequestHandler = async ({ request, locals }) => {
    checkAdminAccess(locals);

    const { name, description, teacherIds } = await request.json();

    const courseId = nanoid();
    const now = new Date();
    const baseSlug = generateSlug(name);

    // Asegurar slug único añadiendo sufijo si es necesario
    let slug = baseSlug;
    let counter = 1;
    while (true) {
        const existing = await db.select({ id: course.id }).from(course).where(eq(course.slug, slug));
        if (existing.length === 0) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
    }

    // Crear el curso
    await db.insert(course).values({
        id: courseId,
        name,
        slug,
        description,
        status: courseStatus.DRAFT,
        createdAt: now,
        updatedAt: now
    });

    // Asignar al creador como owner si está autenticado
    if (locals.user) {
        await CourseRoleUtils.assignCourseRole(courseId, locals.user.id, 'owner');
    }

    // Asignar profesores adicionales
    if (teacherIds?.length > 0) {
        for (const teacherId of teacherIds) {
            await CourseRoleUtils.assignCourseRole(courseId, teacherId, 'teacher');
        }
    }

    return json({ id: courseId });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    checkAdminAccess(locals);

    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'ID is required' }, { status: 400 });

    // Los roles se eliminan automáticamente por CASCADE
    await db.delete(course).where(eq(course.id, id));

    return json({ success: true });
};
