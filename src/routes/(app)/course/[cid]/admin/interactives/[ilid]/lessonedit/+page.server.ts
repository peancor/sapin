import type { Actions, PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db, CourseInteractiveAuthUtils } from '$lib/server/db';
import {
	fileType,
	interactiveLearning,
	interactiveLearningFile,
	interactiveLearningLesson
} from '$lib/server/db/schema';
import type { InteractiveLearningStatusType } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { LessonService } from '$lib/server/lesson/LessonService';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { nanoid } from 'nanoid';

function resolveLifecycleUpdate(
	currentStatus: InteractiveLearningStatusType | undefined,
	nextStatus: InteractiveLearningStatusType,
	now: Date
) {
	return {
		status: nextStatus,
		publishedAt: nextStatus === 'published' && currentStatus !== 'published' ? now : undefined,
		closedAt: nextStatus === 'closed' && currentStatus !== 'closed' ? now : undefined,
		archivedAt: nextStatus === 'archived' && currentStatus !== 'archived' ? now : undefined
	};
}

export const load = (async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'No autorizado');
	}

	const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
		locals.user.id,
		params.cid,
		params.ilid,
		locals.user.highestRoleLevel
	);

	if (!access.allowed) {
		throw error(403, access.reason || 'No tienes permisos para editar esta lesson');
	}

	const [activity, lessonConfig, files] = await Promise.all([
		db.select().from(interactiveLearning).where(eq(interactiveLearning.id, params.ilid)).get(),
		db
			.select()
			.from(interactiveLearningLesson)
			.where(eq(interactiveLearningLesson.id, params.ilid))
			.get(),
		db
			.select()
			.from(interactiveLearningFile)
			.where(eq(interactiveLearningFile.interactiveLearningId, params.ilid))
			.all()
	]);

	if (!activity || activity.type !== 'lesson') {
		throw error(404, 'Lesson no encontrada');
	}

	if (!lessonConfig) {
		throw error(500, 'La lesson no tiene configuración runtime asociada');
	}

	return {
		activity,
		lessonConfig,
		definition: LessonService.parseDefinition(activity.content),
		files
	};
}) satisfies PageServerLoad;

export const actions = {
	updateLesson: async ({ request, params }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim();
		const description = formData.get('description')?.toString() || null;
		const lessonDefinition = formData.get('lessonDefinition')?.toString();
		const sessionPolicyRaw = formData.get('sessionPolicy')?.toString();
		const allowRestart = formData.get('allowRestart') === 'on' || formData.get('allowRestart') === 'true';
		const statusValue = formData.get('status')?.toString();
		const status =
			statusValue === 'published' ||
			statusValue === 'closed' ||
			statusValue === 'archived' ||
			statusValue === 'hidden'
				? (statusValue as InteractiveLearningStatusType)
				: 'hidden';

		if (!name || !lessonDefinition) {
			throw error(400, 'Faltan datos obligatorios de la lesson');
		}

		const parsedDefinition = LessonService.parseDefinition(lessonDefinition);
		const now = new Date();
		const current = await db
			.select({ status: interactiveLearning.status })
			.from(interactiveLearning)
			.where(eq(interactiveLearning.id, params.ilid))
			.get();

		await db
			.update(interactiveLearning)
			.set({
				name,
				description,
				content: LessonService.serializeDefinition(parsedDefinition),
				updatedAt: now,
				...resolveLifecycleUpdate(current?.status, status, now)
			})
			.where(eq(interactiveLearning.id, params.ilid));

		await db
			.update(interactiveLearningLesson)
			.set({
				sessionPolicy:
					sessionPolicyRaw === 'always_new_attempt' ? 'always_new_attempt' : 'resume_latest',
				allowRestart,
				updatedAt: now
			})
			.where(eq(interactiveLearningLesson.id, params.ilid));

		return { success: true };
	},

	uploadFile: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const file = formData.get('file') as File;

		if (!file) throw error(400, 'No se recibió ningún archivo');

		const upload = await fileStorageService.upload({
			file,
			category: 'chat',
			entityType: 'interactive_learning',
			entityId: params.ilid,
			uploadedBy: locals.user?.id || 'system',
			displayName: file.name,
			visibility: 'restricted'
		});

		if (!upload.success) {
			throw error(500, upload.error || 'No se pudo subir el archivo');
		}

		await db.insert(interactiveLearningFile).values({
			id: nanoid(),
			interactiveLearningId: params.ilid,
			fileStorageId: upload.fileId || null,
			name: file.name,
			path: `/api/files/${upload.fileId}`,
			type: file.type.startsWith('image/') ? 'IMAGE' : 'DOCUMENT',
			size: file.size,
			mimeType: file.type,
			createdAt: new Date()
		});

		return { success: true };
	},

	deleteFile: async ({ request, locals }) => {
		const formData = await request.formData();
		const fileId = formData.get('fileId')?.toString();
		if (!fileId) throw error(400, 'No se indicó el archivo');

		const record = await db
			.select()
			.from(interactiveLearningFile)
			.where(eq(interactiveLearningFile.id, fileId))
			.get();

		if (!record) throw error(404, 'Archivo no encontrado');

		if (record.fileStorageId) {
			const deleted = await fileStorageService.delete(record.fileStorageId, locals.user?.id || 'system');
			if (!deleted.success) {
				throw error(500, deleted.error || 'No se pudo borrar el archivo');
			}
		}

		await db.delete(interactiveLearningFile).where(eq(interactiveLearningFile.id, fileId));
		return { success: true };
	}
} satisfies Actions;
