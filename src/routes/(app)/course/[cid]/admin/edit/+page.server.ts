import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	course,
	courseStatus,
	interactiveLearning,
	courseInteractiveLearning,
	fileType,
	courseFile,
	interactiveLearningChat
} from '$lib/server/db/schema';
import type { CourseStatusType } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { Actions } from './$types';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { auditService, auditAction } from '$lib/server/logging';

function getClientIP(request: Request): string | null {
	return (
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		request.headers.get('x-real-ip') ||
		null
	);
}

export const load = (async ({ params }) => {
	// Get chat configurations for interactive learning activities (el id del chat ES el interactiveLearningId)
	const chats = await db
		.select()
		.from(interactiveLearningChat)
		.where(
			eq(
				interactiveLearningChat.id,
				db
					.select({ id: interactiveLearning.id })
					.from(interactiveLearning)
					.innerJoin(
						courseInteractiveLearning,
						eq(courseInteractiveLearning.interactiveLearningId, interactiveLearning.id)
					)
					.where(eq(courseInteractiveLearning.courseId, params.cid))
			)
		);

	return {
		chats
	};
}) satisfies PageServerLoad;

export const actions = {
	updatecourse: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const name = formData.get('name') as string;
		const description = formData.get('description') as string;
		const statusValue = formData.get('status') as string;
		const imageFile = formData.get('image') as File;

		// Validate status
		const validStatuses = Object.values(courseStatus);
		const newStatus = validStatuses.includes(statusValue as CourseStatusType)
			? (statusValue as CourseStatusType)
			: undefined;

		let imagePath = undefined;

		if (imageFile && imageFile.size > 0) {
			// Upload using new file storage system
			const result = await fileStorageService.upload({
				file: imageFile,
				category: 'course',
				entityType: 'course',
				entityId: params.cid,
				uploadedBy: locals.user?.id || 'system',
				displayName: `Imagen del curso ${name}`,
				visibility: 'public'
			});

			if (!result.success) {
				throw error(500, result.error || 'Error al subir la imagen');
			}

			imagePath = `/api/files/${result.fileId}`;
		}

		// Build update object
		const now = new Date();
		const updateData: Record<string, unknown> = {
			name,
			description,
			updatedAt: now
		};

		if (imagePath) {
			updateData.image = imagePath;
		}

		if (newStatus) {
			updateData.status = newStatus;
			// Set publishedAt when publishing for the first time
			if (newStatus === 'published') {
				const [currentCourse] = await db
					.select({ publishedAt: course.publishedAt })
					.from(course)
					.where(eq(course.id, params.cid));
				if (!currentCourse?.publishedAt) {
					updateData.publishedAt = now;
				}
			}
			// Set archivedAt when archiving
			if (newStatus === 'archived') {
				updateData.archivedAt = now;
			}
		}

		await db.update(course).set(updateData).where(eq(course.id, params.cid));

		// Audit log
		await auditService.log({
			action: auditAction.COURSE_UPDATED,
			userId: locals.user?.id,
			targetType: 'course',
			targetId: params.cid,
			details: { name, description, imageUpdated: !!imagePath },
			ipAddress: getClientIP(request),
			userAgent: request.headers.get('user-agent'),
			severity: 'info'
		});

		return { success: true };
	},

	updateOrder: async ({ request, params }) => {
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const newOrder = parseInt(data.get('order')?.toString() || '0');

		if (!id) throw error(400, 'Interactive Learning ID is required');
		if (!Number.isFinite(newOrder)) throw error(400, 'Invalid order');

		const updated = await db
			.update(courseInteractiveLearning)
			.set({ order: newOrder })
			.where(
				and(
					eq(courseInteractiveLearning.interactiveLearningId, id),
					eq(courseInteractiveLearning.courseId, params.cid)
				)
			)
			.returning({ id: courseInteractiveLearning.interactiveLearningId });

		if (updated.length === 0) throw error(404, 'Interactive Learning not found in this course');

		return { success: true };
	},

	uploadFile: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const type = formData.get('type')?.toString() as keyof typeof fileType;

		if (!file) throw error(400, 'No file provided');
		if (!type || !fileType[type]) throw error(400, 'Invalid file type');

		// Upload using new file storage system
		const result = await fileStorageService.upload({
			file,
			category: 'course',
			entityType: 'course',
			entityId: params.cid,
			uploadedBy: locals.user?.id || 'system',
			displayName: file.name,
			visibility: 'restricted'
		});

		if (!result.success) {
			throw error(500, result.error || 'Error al subir el archivo');
		}

		// Save file metadata to database (keeping courseFile table for now)
		await db.insert(courseFile).values({
			id: crypto.randomUUID(),
			courseId: params.cid,
			name: file.name,
			path: `/api/files/${result.fileId}`,
			type,
			size: file.size,
			mimeType: file.type,
			createdAt: new Date()
		});

		return { success: true };
	},

	deleteFile: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const fileId = formData.get('fileId')?.toString();

		if (!fileId) throw error(400, 'No file ID provided');

		// Only files that belong to this course can be deleted from here
		const fileData = await db
			.select()
			.from(courseFile)
			.where(and(eq(courseFile.id, fileId), eq(courseFile.courseId, params.cid)))
			.get();

		if (!fileData) throw error(404, 'File not found in this course');

		// If file is in new system, delete it from storage
		if (fileData.path && fileData.path.startsWith('/api/files/')) {
			const storageFileId = fileData.path.replace('/api/files/', '');
			await fileStorageService.delete(storageFileId, locals.user?.id || 'system');
		}

		// Delete from database
		await db
			.delete(courseFile)
			.where(and(eq(courseFile.id, fileId), eq(courseFile.courseId, params.cid)));

		return { success: true };
	}
} satisfies Actions;
