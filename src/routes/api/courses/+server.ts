import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, CourseRoleUtils } from '$lib/server/db';
import { course, courseStatus } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { error } from '@sveltejs/kit';
import { auditService, auditAction } from '$lib/server/logging';

function getClientIP(request: Request): string | null {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || null;
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

// GET - Obtener todos las cursos con sus profesores
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const courses = await db.select().from(course);

    // Obtener profesores de cada curso usando el nuevo sistema
    const coursesWithTeachers = await Promise.all(courses.map(async (c) => {
        const courseUsers = await CourseRoleUtils.getCourseUsers(c.id);
        const teachers = courseUsers
            .filter(u => ['owner', 'admin', 'teacher'].includes(u.role))
            .map(u => ({ id: u.userId, username: u.username, role: u.role }));

        return {
            ...c,
            teachers
        };
    }));

    return json(coursesWithTeachers);
};

// POST - Crear un nuevo curso
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }

    const { name, description, image } = await request.json();
    if (!name) {
        throw error(400, 'Name is required');
    }

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
        description: description || null,
        image: image || null,
        status: courseStatus.DRAFT,
        createdAt: now,
        updatedAt: now
    });

    // Asignar al creador como owner del curso
    await CourseRoleUtils.assignCourseRole(courseId, locals.user.id, 'owner');

    // Audit log
    await auditService.log({
        action: auditAction.COURSE_CREATED,
        userId: locals.user.id,
        targetType: 'course',
        targetId: courseId,
        details: { name, description },
        ipAddress: getClientIP(request),
        userAgent: request.headers.get('user-agent'),
        severity: 'info'
    });

    return json({ id: courseId });
};

// DELETE - Eliminar una curso
export const DELETE: RequestHandler = async ({ url, request, locals }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }

    // Solo admins pueden eliminar cursos
    if (locals.user.highestRoleLevel < 90) {
        throw error(403, 'Admin access required');
    }

    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'ID is required' }, { status: 400 });

    // Obtener nombre del curso antes de eliminarlo (para el audit log)
    const [courseData] = await db.select({ name: course.name }).from(course).where(eq(course.id, id));

    // Los roles se eliminan automáticamente por CASCADE en la FK
    await db.delete(course).where(eq(course.id, id));

    // Audit log
    await auditService.log({
        action: auditAction.COURSE_DELETED,
        userId: locals.user?.id,
        targetType: 'course',
        targetId: id,
        details: { name: courseData?.name },
        ipAddress: getClientIP(request),
        userAgent: request.headers.get('user-agent'),
        severity: 'warning'
    });

    return json({ success: true });
};