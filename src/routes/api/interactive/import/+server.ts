import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	interactiveLearning,
	interactiveLearningChat,
	interactiveLearningLesson,
	courseInteractiveLearning
} from '$lib/server/db/schema';
import type { InteractiveLearningStatusType } from '$lib/server/db/schema';
import { eq, max } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { CourseRoleUtils } from '$lib/server/db/CourseRoleUtils';
import { generateSlug } from '$lib/utils/slug';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';
import { LessonRevisionService } from '$lib/server/lesson/LessonRevisionService';
import { LessonPackageService } from '$lib/server/lesson/LessonPackageService';
import { auditAction, auditService } from '$lib/server/logging';

interface ImportData {
	version: string;
	activity: {
		name: string;
		slug?: string;
		description?: string | null;
		image?: string | null;
		type: string;
		content: string;
		// Nuevo sistema de ciclo de vida
		status?: InteractiveLearningStatusType;
		metadata?: string | null;
		// Legado: para compatibilidad con exportaciones anteriores
		isActive?: boolean;
	};
	chatConfig?: {
		llmRole?: string | null;
		llmInstructions?: string | null;
		llmContext?: string | null;
		systemPrompt?: string | null;
		llmModel?: string | null;
		temperature?: number | null;
		maxTokens?: number | null;
		topP?: number | null;
		metadata?: string | null;
	} | null;
	lessonConfig?: {
		sessionPolicy?: 'resume_latest' | 'always_new_attempt' | null;
		allowRestart?: boolean | null;
		metadata?: string | null;
	} | null;
}

function getClientIP(request: Request): string | null {
	return (
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		request.headers.get('x-real-ip') ||
		null
	);
}

function isLessonPackageFile(file: File): boolean {
	const name = file.name.toLowerCase();
	return (
		name.endsWith('.sapinlesson.zip') ||
		name.endsWith('.zip') ||
		file.type === 'application/zip' ||
		file.type === 'application/x-zip-compressed'
	);
}

async function importLegacyActivity(input: {
	courseId: string;
	importData: ImportData;
	userId: string;
}): Promise<{
	activityId: string;
	message: string;
	resourceCount: number;
	revisionCount: number;
	type: string;
}> {
	const { courseId, importData } = input;

	if (!importData || !importData.activity) {
		throw error(400, 'Datos de importación inválidos');
	}

	const { activity, chatConfig, lessonConfig } = importData;

	// Validar campos requeridos
	if (!activity.name || !activity.type || !activity.content) {
		throw error(400, 'Faltan campos requeridos en la actividad (name, type, content)');
	}

	if (activity.type === 'lesson') {
		try {
			LessonService.parseDefinition(activity.content);
		} catch (lessonError) {
			if (lessonError instanceof LessonServiceError) {
				throw error(400, lessonError.message);
			}
			throw lessonError;
		}
	}

	const now = new Date();
	const activityId = nanoid();

	// Determinar el status: nuevo formato o mapear desde isActive
	let status: InteractiveLearningStatusType;
	if (activity.status) {
		status = activity.status;
	} else if (activity.isActive !== undefined) {
		// Compatibilidad hacia atrás con formato anterior
		status = activity.isActive ? 'published' : 'hidden';
	} else {
		status = 'hidden'; // Por defecto hidden para nuevas importaciones
	}

	// Generar slug único
	const existingSlugs = await db
		.select({ slug: interactiveLearning.slug })
		.from(interactiveLearning)
		.then((rows) => rows.map((r) => r.slug));

	let slug = activity.slug || generateSlug(activity.name, 60);
	let counter = 1;
	while (existingSlugs.includes(slug)) {
		slug = `${generateSlug(activity.name, 50)}-${counter}`;
		counter++;
	}

	// Crear la actividad
	await db.insert(interactiveLearning).values({
		id: activityId,
		name: activity.name,
		slug,
		description: activity.description || null,
		image: activity.image || null,
		type: activity.type,
		content: activity.content,
		status,
		publishedAt: status === 'published' ? now : null,
		metadata: activity.metadata || null,
		createdAt: now,
		updatedAt: now
	});

	// Si es tipo chat y hay configuración, crear el registro de chat con el MISMO ID (patrón de herencia 1:1)
	if (activity.type === 'chat' && chatConfig) {
		await db.insert(interactiveLearningChat).values({
			id: activityId, // Mismo ID que interactiveLearning
			llmRole: chatConfig.llmRole || null,
			llmInstructions: chatConfig.llmInstructions || null,
			llmContext: chatConfig.llmContext || null,
			systemPrompt: chatConfig.systemPrompt || null,
			llmModel: chatConfig.llmModel || null,
			temperature: chatConfig.temperature || null,
			maxTokens: chatConfig.maxTokens || null,
			topP: chatConfig.topP || null,
			metadata: chatConfig.metadata || null,
			createdAt: now
		});
	}

	if (activity.type === 'lesson') {
		await db.insert(interactiveLearningLesson).values({
			id: activityId,
			sessionPolicy:
				lessonConfig?.sessionPolicy === 'always_new_attempt'
					? 'always_new_attempt'
					: 'resume_latest',
			allowRestart: lessonConfig?.allowRestart ?? true,
			metadata: lessonConfig?.metadata || null,
			createdAt: now,
			updatedAt: now
		});
		await LessonRevisionService.ensureLessonRevisionState(activityId, {
			actorUserId: input.userId
		});
	}

	// Obtener el orden máximo actual para el curso
	const [maxOrderResult] = await db
		.select({ maxOrder: max(courseInteractiveLearning.order) })
		.from(courseInteractiveLearning)
		.where(eq(courseInteractiveLearning.courseId, courseId));

	const nextOrder = (maxOrderResult?.maxOrder ?? 0) + 1;

	// Crear la relación con el curso
	await db.insert(courseInteractiveLearning).values({
		id: nanoid(),
		courseId,
		interactiveLearningId: activityId,
		order: nextOrder,
		createdAt: now
	});

	return {
		activityId,
		message: 'Actividad importada correctamente',
		resourceCount: 0,
		revisionCount: activity.type === 'lesson' ? 2 : 0,
		type: activity.type
	};
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const contentType = request.headers.get('content-type') ?? '';
		let courseId = '';
		let importData: ImportData | null = null;
		let packageFile: File | null = null;

		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			courseId = formData.get('courseId')?.toString() ?? '';
			const file = formData.get('file');
			if (!(file instanceof File)) {
				throw error(400, 'Archivo de importación requerido');
			}

			if (isLessonPackageFile(file)) {
				packageFile = file;
			} else {
				importData = JSON.parse(await file.text()) as ImportData;
			}
		} else {
			const body = await request.json();
			courseId = (body as { courseId: string }).courseId;
			importData = (body as { importData: ImportData }).importData;
		}

		if (!courseId) {
			throw error(400, 'courseId es requerido');
		}

		// Verificar que el usuario tenga permiso para crear actividades en el curso
		const hasPermission = await CourseRoleUtils.userHasCoursePermission(
			locals.user.id,
			courseId,
			'createActivities'
		);

		if (!hasPermission) {
			throw error(403, 'No tienes permisos para importar actividades en este curso');
		}

		const result = packageFile
			? {
					...(await LessonPackageService.importLessonPackage({
						courseId,
						userId: locals.user.id,
						file: packageFile
					})),
					type: 'lesson',
					message: null as string | null
				}
			: {
					...(await importLegacyActivity({
						courseId,
						importData: importData as ImportData,
						userId: locals.user.id
					})),
					formatVersion: importData?.version
				};

		await auditService.log({
			action: auditAction.ACTIVITY_IMPORTED,
			userId: locals.user.id,
			targetType: 'activity',
			targetId: result.activityId,
			details: {
				courseId,
				type: result.type,
				formatVersion: result.formatVersion,
				resourceCount: result.resourceCount,
				revisionCount: result.revisionCount
			},
			ipAddress: getClientIP(request),
			userAgent: request.headers.get('user-agent'),
			severity: 'info'
		});

		return json({
			success: true,
			activityId: result.activityId,
			message: packageFile
				? `Lesson importada correctamente: ${result.resourceCount} recursos y ${result.revisionCount} revisiones`
				: (result.message ?? 'Actividad importada correctamente'),
			resourceCount: result.resourceCount,
			revisionCount: result.revisionCount,
			activityType: result.type
		});
	} catch (e) {
		console.error('Error importando actividad:', e);
		if (e instanceof Error && 'status' in e) {
			throw e;
		}
		throw error(500, 'Error importando actividad');
	}
};
