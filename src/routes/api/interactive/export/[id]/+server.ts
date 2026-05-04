import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	interactiveLearning,
	interactiveLearningChat,
	interactiveLearningLesson,
	courseInteractiveLearning
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { CourseRoleUtils } from '$lib/server/db/CourseRoleUtils';
import { LessonPackageService } from '$lib/server/lesson/LessonPackageService';
import { auditAction, auditService } from '$lib/server/logging';

function getClientIP(request: Request): string | null {
	return (
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		request.headers.get('x-real-ip') ||
		null
	);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { id } = params;

	// Obtener datos de la actividad
	const [activity] = await db
		.select()
		.from(interactiveLearning)
		.where(eq(interactiveLearning.id, id));

	if (!activity) {
		throw error(404, 'Actividad no encontrada');
	}

	// Obtener el curso asociado a esta actividad
	const [courseRelation] = await db
		.select({ courseId: courseInteractiveLearning.courseId })
		.from(courseInteractiveLearning)
		.where(eq(courseInteractiveLearning.interactiveLearningId, id));

	if (!courseRelation) {
		throw error(404, 'La actividad no está asociada a ningún curso');
	}

	// Verificar que el usuario tenga permiso para crear/gestionar actividades en el curso
	const hasPermission = await CourseRoleUtils.userHasCoursePermission(
		locals.user.id,
		courseRelation.courseId,
		'createActivities'
	);

	if (!hasPermission) {
		throw error(403, 'No tienes permisos para exportar actividades de este curso');
	}

	if (activity.type === 'lesson') {
		const lessonPackage = await LessonPackageService.exportLessonPackage(id);
		await auditService.log({
			action: auditAction.ACTIVITY_EXPORTED,
			userId: locals.user.id,
			targetType: 'activity',
			targetId: id,
			details: {
				courseId: courseRelation.courseId,
				type: 'lesson',
				formatVersion: lessonPackage.manifest.formatVersion,
				resourceCount: lessonPackage.manifest.resources.length,
				revisionCount: 2
			},
			ipAddress: getClientIP(request),
			userAgent: request.headers.get('user-agent'),
			severity: 'info'
		});

		return new Response(
			new Blob([toArrayBuffer(lessonPackage.bytes)], { type: 'application/zip' }),
			{
				headers: {
					'Content-Type': 'application/zip',
					'Content-Disposition': `attachment; filename="${lessonPackage.filename}"`
				}
			}
		);
	}

	// Si es tipo chat, obtener también la configuración del chat (el id del chat ES el interactiveLearningId)
	let chatConfig = null;
	if (activity.type === 'chat') {
		const [chat] = await db
			.select()
			.from(interactiveLearningChat)
			.where(eq(interactiveLearningChat.id, id));

		if (chat) {
			// Excluir campos que no deben exportarse
			chatConfig = {
				llmRole: chat.llmRole,
				llmInstructions: chat.llmInstructions,
				llmContext: chat.llmContext,
				systemPrompt: chat.systemPrompt,
				llmModel: chat.llmModel,
				temperature: chat.temperature,
				maxTokens: chat.maxTokens,
				topP: chat.topP,
				metadata: chat.metadata,
				ragEnabled: chat.ragEnabled,
				ragCollectionName: chat.ragCollectionName,
				ragConfig: chat.ragConfig
			};
		}
	}

	let lessonConfig = null;
	if (activity.type === 'lesson') {
		const [lesson] = await db
			.select()
			.from(interactiveLearningLesson)
			.where(eq(interactiveLearningLesson.id, id));

		if (lesson) {
			lessonConfig = {
				sessionPolicy: lesson.sessionPolicy,
				allowRestart: lesson.allowRestart,
				draftRevisionId: lesson.draftRevisionId,
				publishedRevisionId: lesson.publishedRevisionId,
				metadata: lesson.metadata
			};
		}
	}

	// Crear objeto de exportación
	const exportData = {
		version: '2.0', // Nueva versión con campos de ciclo de vida
		exportedAt: new Date().toISOString(),
		activity: {
			name: activity.name,
			slug: activity.slug,
			description: activity.description,
			image: activity.image,
			type: activity.type,
			content: activity.content,
			status: activity.status,
			metadata: activity.metadata,
			publishedAt: activity.publishedAt?.toISOString() || null,
			archivedAt: activity.archivedAt?.toISOString() || null
		},
		chatConfig,
		lessonConfig
	};

	await auditService.log({
		action: auditAction.ACTIVITY_EXPORTED,
		userId: locals.user.id,
		targetType: 'activity',
		targetId: id,
		details: {
			courseId: courseRelation.courseId,
			type: activity.type,
			formatVersion: exportData.version,
			resourceCount: 0
		},
		ipAddress: getClientIP(request),
		userAgent: request.headers.get('user-agent'),
		severity: 'info'
	});

	// Devolver como archivo JSON descargable
	const filename = `activity-${activity.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${Date.now()}.json`;

	return new Response(JSON.stringify(exportData, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
