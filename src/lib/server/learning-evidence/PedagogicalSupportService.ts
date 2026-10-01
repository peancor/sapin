import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { LearningEvidenceService } from '$lib/server/learning-evidence';
import { ActivityAnalyticsService } from '$lib/server/learning-evidence/ActivityAnalyticsService';
import type {
	LearningEvidenceAccessContext,
	LearningEvidenceActivityContext,
	LearningEvidenceStudentRef,
	LearningEvidenceTranscriptSession
} from '$lib/types/learningEvidence';

type ProgressRow = typeof schema.learningActivityProgress.$inferSelect;

interface StudentSupportContext {
	activity: LearningEvidenceActivityContext;
	student: LearningEvidenceStudentRef;
	transcripts: LearningEvidenceTranscriptSession[];
	studentSummary: {
		sessionCount: number;
		totalMessages: number;
		learnerMessageCount: number;
		assistantMessageCount: number;
		toolCallCount: number;
		uiResponseCount: number;
		averageLearnerMessageLength: number;
		firstActivityAt: string | null;
		lastActivityAt: string | null;
	};
	currentProgress: ProgressRow | null;
	courseActivities: Array<{
		id: string;
		name: string;
		description: string | null;
		order: number;
		status: string;
		type: string;
		metadata: string | null;
	}>;
	courseProgressRows: ProgressRow[];
	stuckSessions: Awaited<ReturnType<typeof ActivityAnalyticsService.findStuckSessions>>['sessions'];
	toolUsage: Awaited<ReturnType<typeof ActivityAnalyticsService.getActivityToolUsageSummary>>;
}

function toIso(value: Date | string | null | undefined): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function average(values: number[]): number {
	if (values.length === 0) return 0;
	return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function getStudentLabel(student: LearningEvidenceStudentRef): string {
	return student.alias?.trim() || student.username || student.email || student.userId;
}

function normalizeText(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/\p{Mark}+/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function getFrequentStudentTerms(
	transcripts: LearningEvidenceTranscriptSession[],
	limit = 5
): string[] {
	const counts = new Map<string, number>();
	const stopwords = new Set([
		'about',
		'algunas',
		'algunos',
		'como',
		'con',
		'cuando',
		'donde',
		'para',
		'pero',
		'porque',
		'puede',
		'pueden',
		'sobre',
		'tengo',
		'tiene',
		'that',
		'this',
		'with'
	]);

	for (const session of transcripts) {
		for (const message of session.messages) {
			if (message.role !== 'user') continue;
			for (const token of normalizeText(message.displayText).split(' ')) {
				if (token.length < 5 || stopwords.has(token)) continue;
				counts.set(token, (counts.get(token) ?? 0) + 1);
			}
		}
	}

	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, limit)
		.map(([term]) => term);
}

function computeRiskLevel(context: StudentSupportContext): 'low' | 'medium' | 'high' {
	if (context.currentProgress?.status === 'abandoned') return 'high';
	if (!context.currentProgress && context.studentSummary.sessionCount === 0) return 'high';
	if (context.stuckSessions.length > 0) return 'medium';
	if ((context.currentProgress?.attemptsCount ?? 0) >= 3) return 'medium';
	if (
		context.studentSummary.learnerMessageCount > 0 &&
		context.studentSummary.averageLearnerMessageLength >= 80 &&
		context.currentProgress?.status === 'completed'
	) {
		return 'low';
	}
	return context.currentProgress?.status === 'completed' ? 'low' : 'medium';
}

function buildObservations(context: StudentSupportContext): string[] {
	const observations: string[] = [];
	const status = context.currentProgress?.status ?? 'not_started';

	observations.push(`Estado actual: ${status}.`);

	if (context.studentSummary.sessionCount > 0) {
		observations.push(
			`Ha participado en ${context.studentSummary.sessionCount} sesion(es) con ${context.studentSummary.learnerMessageCount} mensajes del estudiante.`
		);
	}

	if (context.currentProgress?.attemptsCount) {
		observations.push(`Acumula ${context.currentProgress.attemptsCount} intento(s) en la actividad.`);
	}

	if (context.studentSummary.averageLearnerMessageLength > 0) {
		observations.push(
			`La longitud media de sus mensajes es de ${context.studentSummary.averageLearnerMessageLength} caracteres.`
		);
	}

	if (context.stuckSessions.length > 0) {
		observations.push(
			`Se detectan ${context.stuckSessions.length} sesion(es) con senales de atasco o resolucion incompleta.`
		);
	}

	if (context.toolUsage.totalToolFailures > 0) {
		observations.push(
			`Hay ${context.toolUsage.totalToolFailures} fallo(s) de herramienta en su evidencia.`
		);
	}

	return observations;
}

function buildStrengths(context: StudentSupportContext): string[] {
	const strengths: string[] = [];

	if (context.currentProgress?.status === 'completed') {
		strengths.push('Ha logrado cerrar la actividad actual.');
	}

	if (context.studentSummary.learnerMessageCount >= 5) {
		strengths.push('Mantiene una participacion sostenida durante la actividad.');
	}

	if (context.studentSummary.averageLearnerMessageLength >= 80) {
		strengths.push('Sus respuestas suelen estar desarrolladas y no solo son de minima extension.');
	}

	if (context.studentSummary.uiResponseCount > 0) {
		strengths.push('Interactua con los componentes de practica y responde a las actividades UI.');
	}

	if (strengths.length === 0 && context.studentSummary.sessionCount > 0) {
		strengths.push('Existe evidencia reciente sobre la que se puede construir apoyo docente.');
	}

	return strengths;
}

function buildSupportNeeds(context: StudentSupportContext): string[] {
	const needs: string[] = [];

	if (!context.currentProgress && context.studentSummary.sessionCount === 0) {
		needs.push('Necesita iniciar la actividad y aclarar expectativas de trabajo.');
	}

	if (context.currentProgress?.status === 'in_progress') {
		needs.push('Necesita cerrar la actividad con una respuesta final o entrega completa.');
	}

	if ((context.currentProgress?.attemptsCount ?? 0) >= 2) {
		needs.push('Necesita reducir reintentos improductivos y avanzar con una estrategia mas guiada.');
	}

	if (context.stuckSessions.length > 0) {
		needs.push('Necesita desbloquear puntos de atasco detectados en sus sesiones.');
	}

	if (context.studentSummary.averageLearnerMessageLength > 0 && context.studentSummary.averageLearnerMessageLength < 50) {
		needs.push('Necesita desarrollar respuestas mas justificadas y menos telegraficas.');
	}

	if (context.toolUsage.totalToolFailures > 0) {
		needs.push('Necesita una via alternativa o apoyo cuando las herramientas fallan.');
	}

	return needs;
}

async function loadStudentSupportContext(
	access: LearningEvidenceAccessContext,
	params: {
		activityId: string;
		studentId: string;
		dateFrom?: string;
		dateTo?: string;
		search?: string;
	}
): Promise<StudentSupportContext> {
	const activity = await LearningEvidenceService.getActivityContext(access, params.activityId);
	const transcripts = await LearningEvidenceService.getActivityTranscripts(access, {
		activityId: params.activityId,
		studentIds: [params.studentId],
		dateFrom: params.dateFrom,
		dateTo: params.dateTo,
		search: params.search
	});
	const overview = await LearningEvidenceService.getActivityEvidenceOverview(
		access,
		params.activityId,
		[params.studentId]
	);

	const studentFromRoster =
		activity.courseId !== null
			? (
					await LearningEvidenceService.getCourseStudentRoster(access, activity.courseId, [params.studentId])
				)[0]
			: null;
	const student = studentFromRoster ?? transcripts[0]?.student;

	if (!student) {
		throw new Error('No se encontro evidencia ni matricula para el estudiante solicitado.');
	}

	const summary = overview.studentSummaries.find((item) => item.userId === params.studentId) ?? {
		userId: student.userId,
		username: student.username,
		email: student.email,
		alias: student.alias,
		sessionCount: transcripts.length,
		totalMessages: transcripts.reduce((sum, session) => sum + session.messageCount, 0),
		learnerMessageCount: transcripts.reduce((sum, session) => sum + session.learnerMessageCount, 0),
		assistantMessageCount: transcripts.reduce((sum, session) => sum + session.assistantMessageCount, 0),
		toolCallCount: transcripts.reduce((sum, session) => sum + session.toolCallCount, 0),
		uiResponseCount: transcripts.reduce((sum, session) => sum + session.uiResponseCount, 0),
		averageLearnerMessageLength: average(
			transcripts.flatMap((session) =>
				session.messages
					.filter((message) => message.role === 'user')
					.map((message) => message.displayText.length)
			)
		),
		firstActivityAt: transcripts[0]?.sessionStartedAt ?? null,
		lastActivityAt: transcripts.at(-1)?.sessionUpdatedAt ?? null
	};

	const currentProgress =
		activity.courseId !== null
			? (await db
					.select()
					.from(schema.learningActivityProgress)
					.where(
						and(
							eq(schema.learningActivityProgress.courseId, activity.courseId),
							eq(schema.learningActivityProgress.activityId, params.activityId),
							eq(schema.learningActivityProgress.userId, params.studentId)
						)
					)
					.get()) ?? null
			: null;

	const courseActivities =
		activity.courseId !== null
			? await db
					.select({
						id: schema.interactiveLearning.id,
						name: schema.interactiveLearning.name,
						description: schema.interactiveLearning.description,
						order: schema.courseInteractiveLearning.order,
						status: schema.interactiveLearning.status,
						type: schema.interactiveLearning.type,
						metadata: schema.interactiveLearning.metadata
					})
					.from(schema.courseInteractiveLearning)
					.innerJoin(
						schema.interactiveLearning,
						eq(
							schema.courseInteractiveLearning.interactiveLearningId,
							schema.interactiveLearning.id
						)
					)
					.where(eq(schema.courseInteractiveLearning.courseId, activity.courseId))
					.orderBy(schema.courseInteractiveLearning.order)
			: [];

	const courseProgressRows =
		activity.courseId !== null && courseActivities.length > 0
			? await db
					.select()
					.from(schema.learningActivityProgress)
					.where(
						and(
							eq(schema.learningActivityProgress.courseId, activity.courseId),
							eq(schema.learningActivityProgress.userId, params.studentId),
							inArray(
								schema.learningActivityProgress.activityId,
								courseActivities.map((item) => item.id)
							)
						)
					)
			: [];

	const stuckResult = await ActivityAnalyticsService.findStuckSessions(access, {
		activityId: params.activityId,
		studentIds: [params.studentId],
		dateFrom: params.dateFrom,
		dateTo: params.dateTo,
		search: params.search,
		maxResults: 5
	});

	const toolUsage = await ActivityAnalyticsService.getActivityToolUsageSummary(access, {
		activityId: params.activityId,
		studentIds: [params.studentId],
		dateFrom: params.dateFrom,
		dateTo: params.dateTo,
		search: params.search,
		limit: 5
	});

	return {
		activity,
		student,
		transcripts,
		studentSummary: {
			sessionCount: summary.sessionCount,
			totalMessages: summary.totalMessages,
			learnerMessageCount: summary.learnerMessageCount,
			assistantMessageCount: summary.assistantMessageCount,
			toolCallCount: summary.toolCallCount,
			uiResponseCount: summary.uiResponseCount,
			averageLearnerMessageLength: summary.averageLearnerMessageLength,
			firstActivityAt: summary.firstActivityAt,
			lastActivityAt: summary.lastActivityAt
		},
		currentProgress,
		courseActivities,
		courseProgressRows,
		stuckSessions: stuckResult.sessions,
		toolUsage
	};
}

export class PedagogicalSupportService {
	static async summarizeEvidenceForStudent(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentId: string;
			dateFrom?: string;
			dateTo?: string;
			search?: string;
			includeTranscriptExcerpts?: boolean;
		}
	) {
		const context = await loadStudentSupportContext(access, params);
		const riskLevel = computeRiskLevel(context);
		const completedActivities = context.courseProgressRows.filter((row) => row.status === 'completed').length;
		const inProgressActivities = context.courseProgressRows.filter((row) => row.status === 'in_progress').length;

		return {
			activityId: params.activityId,
			activityName: context.activity.name,
			student: context.student,
			riskLevel,
			summary: {
				status: context.currentProgress?.status ?? 'not_started',
				sessionCount: context.studentSummary.sessionCount,
				totalMessages: context.studentSummary.totalMessages,
				learnerMessageCount: context.studentSummary.learnerMessageCount,
				toolCallCount: context.studentSummary.toolCallCount,
				uiResponseCount: context.studentSummary.uiResponseCount,
				attemptsCount: context.currentProgress?.attemptsCount ?? 0,
				timeSpentSeconds: context.currentProgress?.timeSpentSeconds ?? 0,
				firstActivityAt: context.studentSummary.firstActivityAt,
				lastActivityAt: context.studentSummary.lastActivityAt
			},
			observations: buildObservations(context),
			strengths: buildStrengths(context),
			supportNeeds: buildSupportNeeds(context),
			courseProgress: {
				totalActivities: context.courseActivities.length,
				completedActivities,
				inProgressActivities,
				lastActivityAt:
					toIso(context.currentProgress?.lastInteractionAt) ?? context.studentSummary.lastActivityAt
			},
			toolSignals: {
				totalToolCalls: context.toolUsage.totalToolCalls,
				totalToolFailures: context.toolUsage.totalToolFailures,
				topTools: context.toolUsage.tools
			},
			stuckSessions: context.stuckSessions,
			transcriptExcerpts: params.includeTranscriptExcerpts
				? context.transcripts.slice(-2).map((session) => ({
						chatId: session.chatId,
						sessionUpdatedAt: session.sessionUpdatedAt,
						messages: session.messages.slice(-4).map((message) => ({
							role: message.role,
							text: message.displayText
						}))
					}))
				: []
		};
	}

	static async draftTeacherFeedback(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentId: string;
			tone?: 'supportive' | 'direct' | 'celebratory';
			dateFrom?: string;
			dateTo?: string;
			search?: string;
		}
	) {
		const context = await loadStudentSupportContext(access, params);
		const tone = params.tone ?? 'supportive';
		const studentLabel = getStudentLabel(context.student);
		const strengths = buildStrengths(context);
		const supportNeeds = buildSupportNeeds(context);
		const nextSteps = [
			...(context.currentProgress?.status !== 'completed'
				? ['Retomar la actividad actual y cerrar una respuesta o entrega completa.']
				: ['Consolidar lo logrado aplicando el mismo nivel de detalle en la siguiente actividad.']),
			...(context.stuckSessions.length > 0
				? ['Revisar contigo el punto exacto donde se atasca y acordar una estrategia de salida.']
				: []),
			...(context.toolUsage.totalToolFailures > 0
				? ['Proporcionar una alternativa cuando falle la herramienta o el flujo interactivo.']
				: []),
			...(context.studentSummary.averageLearnerMessageLength > 0 &&
			context.studentSummary.averageLearnerMessageLength < 50
				? ['Pedir respuestas mas justificadas, con ejemplo o razonamiento explicito.']
				: [])
		].slice(0, 3);

		const openingByTone = {
			supportive: `Hola ${studentLabel}, he revisado tu trabajo en "${context.activity.name}" y quiero dejarte una orientacion breve para ayudarte a avanzar.`,
			direct: `He revisado tu trabajo en "${context.activity.name}". Estas son las observaciones principales que deberias tener en cuenta.`,
			celebratory: `Buen trabajo, ${studentLabel}. Al revisar "${context.activity.name}" se observan avances claros y tambien algun punto a reforzar.`
		} as const;

		const closingByTone = {
			supportive: 'Si lo necesitas, podemos revisar juntos el siguiente paso para que avances con mas seguridad.',
			direct: 'Conviene actuar sobre estos puntos en la siguiente iteracion para evitar mas friccion.',
			celebratory: 'Si mantienes este ritmo y corriges el punto de friccion detectado, el avance deberia ser solido.'
		} as const;

		const bodyParagraphs = [
			strengths.length > 0
				? `Fortalezas observadas: ${strengths.join(' ')}`
				: 'Todavia hay poca evidencia positiva acumulada en la actividad.',
			supportNeeds.length > 0
				? `Punto(s) a reforzar: ${supportNeeds.join(' ')}`
				: 'No se detectan necesidades urgentes de apoyo en esta actividad.',
			nextSteps.length > 0
				? `Siguiente paso recomendado: ${nextSteps.join(' ')}`
				: 'Siguiente paso recomendado: mantener el trabajo actual y monitorizar la siguiente sesion.'
		];

		return {
			activityId: params.activityId,
			activityName: context.activity.name,
			student: context.student,
			tone,
			evidence: {
				status: context.currentProgress?.status ?? 'not_started',
				sessionCount: context.studentSummary.sessionCount,
				learnerMessageCount: context.studentSummary.learnerMessageCount,
				attemptsCount: context.currentProgress?.attemptsCount ?? 0,
				lastActivityAt: context.studentSummary.lastActivityAt,
				stuckSessions: context.stuckSessions.length,
				toolFailures: context.toolUsage.totalToolFailures
			},
			strengths,
			supportNeeds,
			nextSteps,
			draft: {
				subject: `Feedback sobre ${context.activity.name}`,
				opening: openingByTone[tone],
				bodyParagraphs,
				closing: closingByTone[tone],
				fullText: [openingByTone[tone], ...bodyParagraphs, closingByTone[tone]].join('\n\n')
			}
		};
	}

	static async draftRemediationPlan(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentId: string;
			dateFrom?: string;
			dateTo?: string;
			search?: string;
			maxActions?: number;
		}
	) {
		const context = await loadStudentSupportContext(access, params);
		const maxActions = Math.max(2, Math.min(params.maxActions ?? 4, 6));
		const frequentTerms = getFrequentStudentTerms(context.transcripts, 4);
		const supportNeeds = buildSupportNeeds(context);
		const studentActions = [
			{
				title: 'Rehacer el tramo donde se atasca',
				rationale:
					context.stuckSessions.length > 0
						? context.stuckSessions[0].reasons[0] ?? 'Hay evidencia de atasco en la sesion.'
						: 'Conviene revisar el tramo central de la actividad con apoyo.'
			},
			{
				title: 'Responder con mas justificacion',
				rationale:
					context.studentSummary.averageLearnerMessageLength < 50
						? 'Los mensajes tienden a ser muy breves.'
						: 'Ayuda a fijar mejor el razonamiento y hacer visible la comprension.'
			},
			{
				title: 'Comprobar el resultado de cada paso antes de continuar',
				rationale:
					context.toolUsage.totalToolFailures > 0
						? 'Se observan fallos de herramienta y conviene validar cada paso.'
						: 'Reduce errores acumulados y ayuda a detectar dudas antes.'
			},
			{
				title: 'Relacionar la actividad con conceptos clave',
				rationale:
					frequentTerms.length > 0
						? `Los terminos mas presentes en su trabajo son: ${frequentTerms.join(', ')}.`
						: 'Ayuda a conectar la tarea con el vocabulario conceptual del curso.'
			}
		].slice(0, maxActions);

		const teacherActions = [
			'Ofrecer un ejemplo resuelto o semirresuelto del paso donde se bloquea.',
			'Pedir una explicacion breve del razonamiento antes de dar la solucion.',
			'Confirmar que entiende cuando debe usar la herramienta y cuando puede seguir sin ella.'
		].slice(0, Math.min(3, maxActions));

		const successCriteria = [
			'Completa la actividad sin dejar pasos abiertos.',
			'Explica al menos una decision o respuesta con justificacion explicita.',
			'Reduce reintentos improductivos en la siguiente sesion.'
		];

		return {
			activityId: params.activityId,
			activityName: context.activity.name,
			student: context.student,
			riskLevel: computeRiskLevel(context),
			targetOutcomes: supportNeeds.length > 0 ? supportNeeds : ['Consolidar el aprendizaje ya evidenciado.'],
			evidenceSignals: buildObservations(context),
			suggestedFocusTerms: frequentTerms,
			studentActions,
			teacherActions,
			successCriteria
		};
	}

	static async recommendNextActivity(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentId: string;
			preferPublishedOnly?: boolean;
		}
	) {
		const context = await loadStudentSupportContext(access, {
			activityId: params.activityId,
			studentId: params.studentId
		});
		const preferPublishedOnly = params.preferPublishedOnly ?? true;
		const currentActivity = context.courseActivities.find((item) => item.id === params.activityId) ?? null;
		const progressByActivityId = new Map(context.courseProgressRows.map((row) => [row.activityId, row]));
		const eligibleActivities = context.courseActivities.filter((activity) =>
			preferPublishedOnly
				? activity.status === 'published' || activity.status === 'closed'
				: activity.status !== 'archived' && activity.status !== 'hidden'
		);

		if (!currentActivity) {
			return {
				activityId: params.activityId,
				student: context.student,
				recommendationType: 'stay_current',
				reason: 'La actividad actual no forma parte de una secuencia de curso reconocible.',
				recommendedActivity: null,
				alternativeActivities: []
			};
		}

		const currentStatus = context.currentProgress?.status ?? 'not_started';
		if (currentStatus !== 'completed') {
			return {
				activityId: params.activityId,
				student: context.student,
				recommendationType: 'stay_current',
				reason: `Conviene cerrar primero la actividad actual porque su estado sigue en "${currentStatus}".`,
				recommendedActivity: {
					id: currentActivity.id,
					name: currentActivity.name,
					description: currentActivity.description,
					order: currentActivity.order,
					status: currentActivity.status,
					type: currentActivity.type
				},
				alternativeActivities: []
			};
		}

		const nextIncomplete = eligibleActivities.find((activity) => {
			if (activity.order <= currentActivity.order) return false;
			return progressByActivityId.get(activity.id)?.status !== 'completed';
		});

		const fallbackIncomplete = eligibleActivities.find(
			(activity) => progressByActivityId.get(activity.id)?.status !== 'completed'
		);

		const recommended = nextIncomplete ?? fallbackIncomplete ?? null;
		const alternativeActivities = eligibleActivities
			.filter((activity) => activity.id !== recommended?.id && activity.order > currentActivity.order)
			.filter((activity) => progressByActivityId.get(activity.id)?.status !== 'completed')
			.slice(0, 3)
			.map((activity) => ({
				id: activity.id,
				name: activity.name,
				description: activity.description,
				order: activity.order,
				status: activity.status,
				type: activity.type
			}));

		if (!recommended) {
			return {
				activityId: params.activityId,
				student: context.student,
				recommendationType: 'review',
				reason: 'No quedan actividades pendientes en la secuencia del curso para este estudiante.',
				recommendedActivity: null,
				alternativeActivities: []
			};
		}

		const metadata = parseJsonObject(recommended.metadata);
		return {
			activityId: params.activityId,
			student: context.student,
			recommendationType:
				nextIncomplete !== null && nextIncomplete !== undefined ? 'next_in_sequence' : 'resume_incomplete',
			reason:
				nextIncomplete !== null && nextIncomplete !== undefined
					? 'Ha completado la actividad actual y la siguiente pendiente en la secuencia es la recomendacion natural.'
					: 'No hay una siguiente actividad directa disponible; se propone la primera pendiente del curso.',
			recommendedActivity: {
				id: recommended.id,
				name: recommended.name,
				description: recommended.description,
				order: recommended.order,
				status: recommended.status,
				type: recommended.type,
				estimatedMinutes:
					typeof metadata.estimatedMinutes === 'number' ? metadata.estimatedMinutes : null,
				tags: Array.isArray(metadata.tags)
					? metadata.tags.filter((value): value is string => typeof value === 'string').slice(0, 5)
					: []
			},
			alternativeActivities
		};
	}
}
