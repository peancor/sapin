import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { course, courseStatus } from '$lib/server/db/schema';
import type { CourseStatusType } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fail, error } from '@sveltejs/kit';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { auditService, auditAction } from '$lib/server/logging';

function getClientIP(request: Request): string | null {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || null;
}

export const load = (async ({ parent }) => {
    const parentData = await parent();
    return {
        ...parentData
    };
}) satisfies PageServerLoad;

export const actions = {
    updateCourse: async ({ request, params, locals }) => {
        const formData = await request.formData();
        const name = formData.get('name') as string;
        const description = formData.get('description') as string;
        const statusValue = formData.get('status') as string;

        if (!name || name.trim().length === 0) {
            return fail(400, {
                error: 'El nombre es obligatorio',
                values: { name, description, status: statusValue }
            });
        }

        // Validate status
        const validStatuses = Object.values(courseStatus);
        const newStatus = validStatuses.includes(statusValue as CourseStatusType)
            ? (statusValue as CourseStatusType)
            : undefined;

        // Build update object
        const now = new Date();
        const updateData: Record<string, unknown> = {
            name: name.trim(),
            description: description?.trim() || null,
            updatedAt: now
        };

        if (newStatus) {
            updateData.status = newStatus;
            // Set publishedAt when publishing for the first time
            if (newStatus === 'published') {
                const [currentCourse] = await db.select({ publishedAt: course.publishedAt }).from(course).where(eq(course.id, params.cid));
                if (!currentCourse?.publishedAt) {
                    updateData.publishedAt = now;
                }
            }
            // Set archivedAt when archiving
            if (newStatus === 'archived') {
                updateData.archivedAt = now;
            }
        }

        try {
            await db.update(course)
                .set(updateData)
                .where(eq(course.id, params.cid));

            // Audit log
            await auditService.log({
                action: auditAction.COURSE_UPDATED,
                userId: locals.user?.id,
                targetType: 'course',
                targetId: params.cid,
                details: { name, description, statusUpdated: !!newStatus },
                ipAddress: getClientIP(request),
                userAgent: request.headers.get('user-agent'),
                severity: 'info'
            });

            return { success: true };
        } catch (err) {
            console.error('Error updating course:', err);
            return fail(500, {
                error: 'Error al guardar los cambios',
                values: { name, description, status: statusValue }
            });
        }
    },

    uploadImage: async ({ request, params, locals }) => {
        const formData = await request.formData();
        const imageFile = formData.get('image') as File;

        if (!imageFile || imageFile.size === 0) {
            return fail(400, { imageError: 'No se ha seleccionado ninguna imagen' });
        }

        // Validate file type
        if (!imageFile.type.startsWith('image/')) {
            return fail(400, { imageError: 'El archivo debe ser una imagen' });
        }

        // Validate file size (5MB max)
        if (imageFile.size > 5 * 1024 * 1024) {
            return fail(400, { imageError: 'La imagen no puede superar los 5MB' });
        }

        try {
            // Get current course name for display
            const [currentCourse] = await db.select({ name: course.name }).from(course).where(eq(course.id, params.cid));

            // Upload using file storage service
            const result = await fileStorageService.upload({
                file: imageFile,
                category: 'course',
                entityType: 'course',
                entityId: params.cid,
                uploadedBy: locals.user?.id || 'system',
                displayName: `Imagen del curso ${currentCourse?.name || params.cid}`,
                visibility: 'public'
            });

            if (!result.success) {
                return fail(500, { imageError: result.error || 'Error al subir la imagen' });
            }

            const imagePath = `/api/files/${result.fileId}`;

            // Update course with new image
            await db.update(course)
                .set({
                    image: imagePath,
                    updatedAt: new Date()
                })
                .where(eq(course.id, params.cid));

            // Audit log
            await auditService.log({
                action: auditAction.COURSE_UPDATED,
                userId: locals.user?.id,
                targetType: 'course',
                targetId: params.cid,
                details: { imageUpdated: true },
                ipAddress: getClientIP(request),
                userAgent: request.headers.get('user-agent'),
                severity: 'info'
            });

            return { imageSuccess: true };
        } catch (err) {
            console.error('Error uploading image:', err);
            return fail(500, { imageError: 'Error al subir la imagen' });
        }
    }
} satisfies Actions;
