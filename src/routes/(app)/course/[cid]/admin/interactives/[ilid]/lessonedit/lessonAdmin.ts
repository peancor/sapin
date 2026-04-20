import { error } from '@sveltejs/kit';
import { db, CourseInteractiveAuthUtils } from '$lib/server/db';
import {
	fileType,
	interactiveLearning,
	interactiveLearningFile,
	interactiveLearningLesson
} from '$lib/server/db/schema';
import type {
	InteractiveLearning,
	InteractiveLearningFile,
	InteractiveLearningLesson,
	InteractiveLearningStatusType
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { LessonService } from '$lib/server/lesson/LessonService';
import { LessonRevisionService } from '$lib/server/lesson/LessonRevisionService';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { nanoid } from 'nanoid';

type LessonAdminUser = {
	id: string;
	highestRoleLevel: number;
};

type LessonAdminLocals = {
	user?: LessonAdminUser | null;
};

export function resolveLifecycleUpdate(
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

export async function requireLessonAdminContext(
	cid: string,
	ilid: string,
	locals: LessonAdminLocals
): Promise<{
	user: LessonAdminUser;
	activity: InteractiveLearning;
	lessonConfig: InteractiveLearningLesson;
}> {
	if (!locals.user) {
		throw error(401, 'No autorizado');
	}

	const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
		locals.user.id,
		cid,
		ilid,
		locals.user.highestRoleLevel
	);

	if (!access.allowed) {
		throw error(403, access.reason || 'No tienes permisos para editar esta lesson');
	}

	const [activity, lessonConfig] = await Promise.all([
		db.select().from(interactiveLearning).where(eq(interactiveLearning.id, ilid)).get(),
		db
			.select()
			.from(interactiveLearningLesson)
			.where(eq(interactiveLearningLesson.id, ilid))
			.get()
	]);

	if (!activity || activity.type !== 'lesson') {
		throw error(404, 'Lesson no encontrada');
	}

	if (!lessonConfig) {
		throw error(500, 'La lesson no tiene configuración runtime asociada');
	}

	return {
		user: locals.user,
		activity,
		lessonConfig
	};
}

export async function loadLessonAdminData(
	cid: string,
	ilid: string,
	locals: LessonAdminLocals
): Promise<{
	activity: InteractiveLearning;
	lessonConfig: InteractiveLearningLesson;
	definition: ReturnType<typeof LessonService.parseDefinition>;
	files: InteractiveLearningFile[];
	graphSummaries: ReturnType<typeof LessonService.getGraphSummaries>;
	models: Awaited<ReturnType<typeof AIUtils.getAvailableModels>>;
	defaultModel: Awaited<ReturnType<typeof AIUtils.getDefaultModel>>;
	revisionSummary: Awaited<ReturnType<typeof LessonRevisionService.getRevisionAdminSummary>>;
}> {
	const { activity, lessonConfig } = await requireLessonAdminContext(cid, ilid, locals);
	const [files, models, defaultModel, revisionState, revisionSummary] = await Promise.all([
		db
			.select()
			.from(interactiveLearningFile)
			.where(eq(interactiveLearningFile.interactiveLearningId, ilid))
			.all(),
		AIUtils.getAvailableModels(),
		AIUtils.getDefaultModel(),
		LessonRevisionService.ensureLessonRevisionState(ilid, {
			actorUserId: locals.user?.id ?? null
		}),
		LessonRevisionService.getRevisionAdminSummary(ilid)
	]);
	const definition = revisionState.draftDefinition;
	const nextLessonConfig =
		lessonConfig.draftRevisionId === revisionState.lesson.draftRevisionId &&
		lessonConfig.publishedRevisionId === revisionState.lesson.publishedRevisionId
			? lessonConfig
			: revisionState.lesson;

	return {
		activity,
		lessonConfig: nextLessonConfig,
		definition,
		files,
		graphSummaries: LessonService.getGraphSummaries(definition),
		models,
		defaultModel,
		revisionSummary
	};
}

export async function uploadLessonFile(input: {
	ilid: string;
	userId: string;
	file: File;
	type?: keyof typeof fileType;
}): Promise<InteractiveLearningFile> {
	const { ilid, userId, file, type } = input;
	const resolvedType = type ?? (file.type.startsWith('image/') ? 'IMAGE' : 'DOCUMENT');

	const upload = await fileStorageService.upload({
		file,
		category: 'chat',
		entityType: 'interactive_learning',
		entityId: ilid,
		uploadedBy: userId,
		displayName: file.name,
		visibility: 'restricted'
	});

	if (!upload.success || !upload.fileId) {
		throw error(500, upload.error || 'No se pudo subir el archivo');
	}

	const [createdFile] = await db
		.insert(interactiveLearningFile)
		.values({
			id: nanoid(),
			interactiveLearningId: ilid,
			fileStorageId: upload.fileId,
			name: file.name,
			path: `/api/files/${upload.fileId}`,
			type: resolvedType,
			size: file.size,
			mimeType: file.type,
			createdAt: new Date()
		})
		.returning();

	return createdFile;
}

export async function deleteLessonFile(input: {
	ilid: string;
	fileId: string;
	userId: string;
}): Promise<void> {
	const { ilid, fileId, userId } = input;
	const record = await db
		.select()
		.from(interactiveLearningFile)
		.where(eq(interactiveLearningFile.id, fileId))
		.get();

	if (!record) {
		throw error(404, 'Archivo no encontrado');
	}

	if (record.interactiveLearningId !== ilid) {
		throw error(403, 'El archivo no pertenece a esta lesson');
	}

	if (record.fileStorageId) {
		const deleted = await fileStorageService.delete(record.fileStorageId, userId);
		if (!deleted.success) {
			throw error(500, deleted.error || 'No se pudo borrar el archivo');
		}
	}

	await db.delete(interactiveLearningFile).where(eq(interactiveLearningFile.id, fileId));
}
