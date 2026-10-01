import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type { LearningEvidenceAccessContext } from '$lib/types/learningEvidence';
import { LearningEvidenceService } from './LearningEvidenceService';
import {
	analyzeToolFrictionHotspotsFromTranscripts,
	buildDropoutFunnel,
	buildSessionExcerpt,
	daysSince,
	extractRepeatedLearnerTurns,
	getLatestIso
} from './operationalAnalytics';

function toIso(value: Date | string | null | undefined): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function priorityFromScore(score: number): 'low' | 'medium' | 'high' {
	if (score >= 70) return 'high';
	if (score >= 40) return 'medium';
	return 'low';
}

async function getActivityMeta(activityId: string) {
	const [row] = await db
		.select({
			id: schema.interactiveLearning.id,
			name: schema.interactiveLearning.name,
			publishedAt: schema.interactiveLearning.publishedAt,
			createdAt: schema.interactiveLearning.createdAt,
			courseId: schema.courseInteractiveLearning.courseId
		})
		.from(schema.interactiveLearning)
		.leftJoin(
			schema.courseInteractiveLearning,
			eq(schema.courseInteractiveLearning.interactiveLearningId, schema.interactiveLearning.id)
		)
		.where(eq(schema.interactiveLearning.id, activityId))
		.limit(1);

	return row ?? null;
}

export class ActivityMicroAnalyticsService {
	static async getActivityNonStarters(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentIds?: string[];
			daysSincePublished?: number;
		}
	) {
		const [overview, activityMeta] = await Promise.all([
			LearningEvidenceService.getActivityEvidenceOverview(access, params.activityId, params.studentIds),
			getActivityMeta(params.activityId)
		]);

		const publishedReference = toIso(activityMeta?.publishedAt) ?? toIso(activityMeta?.createdAt);
		const activityAgeDays = daysSince(publishedReference);
		const nonStarterSummaries = overview.studentSummaries.filter(
			(student) => student.progressStatus === 'not_started' && student.sessionCount === 0
		);
		const nonStarterIds = nonStarterSummaries.map((student) => student.userId);

		const otherActivityProgress =
			overview.activity.courseId && nonStarterIds.length > 0
				? await db
						.select({
							userId: schema.learningActivityProgress.userId,
							activityId: schema.learningActivityProgress.activityId,
							status: schema.learningActivityProgress.status,
							lastInteractionAt: schema.learningActivityProgress.lastInteractionAt
						})
						.from(schema.learningActivityProgress)
						.where(
							and(
								eq(schema.learningActivityProgress.courseId, overview.activity.courseId),
								inArray(schema.learningActivityProgress.userId, nonStarterIds),
								ne(schema.learningActivityProgress.activityId, params.activityId)
							)
						)
				: [];

		const progressByStudent = new Map<
			string,
			Array<{
				activityId: string;
				status: string;
				lastInteractionAt: Date | null;
			}>
		>();

		for (const row of otherActivityProgress) {
			const bucket = progressByStudent.get(row.userId) ?? [];
			bucket.push(row);
			progressByStudent.set(row.userId, bucket);
		}

		const items = nonStarterSummaries
			.map((student) => {
				const otherProgress = progressByStudent.get(student.userId) ?? [];
				const startedElsewhere = otherProgress.filter((row) => row.status !== 'not_started').length;
				const completedElsewhere = otherProgress.filter((row) => row.status === 'completed').length;
				const lastCourseActivityAt = getLatestIso(
					otherProgress.map((row) => toIso(row.lastInteractionAt)).filter(Boolean)
				);
				let priorityScore = startedElsewhere > 0 ? 45 : 25;
				if (completedElsewhere > 0) priorityScore += 15;
				if ((activityAgeDays ?? 0) >= (params.daysSincePublished ?? 7)) priorityScore += 20;
				if (lastCourseActivityAt && (daysSince(lastCourseActivityAt) ?? 999) <= 7) priorityScore += 15;

				return {
					student: {
						userId: student.userId,
						username: student.username,
						email: student.email,
						alias: student.alias
					},
					lastCourseActivityAt,
					otherStartedActivities: startedElsewhere,
					otherCompletedActivities: completedElsewhere,
					priority: priorityFromScore(priorityScore),
					priorityScore,
					evidence: [
						'No hay sesiones ni progreso en esta actividad.',
						startedElsewhere > 0
							? `Sí muestra actividad en ${startedElsewhere} actividad(es) del curso.`
							: 'Tampoco hay otras actividades arrancadas en el curso.'
					]
				};
			})
			.sort((a, b) => b.priorityScore - a.priorityScore || a.student.username.localeCompare(b.student.username));

		const highPriorityCount = items.filter((item) => item.priority === 'high').length;
		const nonStarterRate =
			overview.totalEnrolledStudents > 0
				? Math.round((items.length / overview.totalEnrolledStudents) * 100)
				: 0;
		const alerts: string[] = [];
		if (nonStarterRate >= 35) {
			alerts.push(`La actividad acumula un ${nonStarterRate}% de alumnado que no ha arrancado.`);
		}
		if (
			typeof params.daysSincePublished === 'number' &&
			(activityAgeDays ?? 0) < params.daysSincePublished
		) {
			alerts.push(
				`La actividad lleva ${activityAgeDays ?? 0} dia(s) disponible; aun no supera el umbral de ${params.daysSincePublished} dia(s).`
			);
		}

		return {
			activityId: params.activityId,
			activityName: overview.activity.name,
			summary: {
				totalEnrolledStudents: overview.totalEnrolledStudents,
				nonStarterCount: items.length,
				nonStarterRate,
				highPriorityCount,
				activityAgeDays
			},
			items,
			alerts,
			recommendedActions: [
				...(highPriorityCount > 0
					? ['Contactar primero con quienes sí avanzan en el curso pero no han arrancado esta actividad.']
					: []),
				...(nonStarterRate >= 35
					? ['Revisar consigna, visibilidad y fricción inicial de la actividad antes de insistir individualmente.']
					: ['Mantener seguimiento ligero y reactivar tras la siguiente ventana de trabajo.'])
			],
			limitations: [
				'La nocion de no-arranque se basa en ausencia de sesiones y progreso registrado.',
				'No distingue si el alumnado ha visto la consigna fuera de la plataforma.'
			]
		};
	}

	static async getActivityDropoutFunnel(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentIds?: string[];
		}
	) {
		const [overview, activityMeta] = await Promise.all([
			LearningEvidenceService.getActivityEvidenceOverview(access, params.activityId, params.studentIds),
			getActivityMeta(params.activityId)
		]);

		const funnel = buildDropoutFunnel(
			overview.studentSummaries,
			toIso(activityMeta?.publishedAt) ?? toIso(activityMeta?.createdAt)
		);
		const abandonedItems = overview.studentSummaries
			.filter((student) => student.progressStatus === 'abandoned')
			.slice(0, 8)
			.map((student) => ({
				student: {
					userId: student.userId,
					username: student.username,
					email: student.email,
					alias: student.alias
				},
				sessionCount: student.sessionCount,
				attemptsCount: student.attemptsCount,
				firstActivityAt: student.firstActivityAt,
				lastActivityAt: student.lastActivityAt
			}));

		const startedRate = funnel.stages.find((stage) => stage.key === 'started')?.rate ?? 0;
		const completedRate = funnel.stages.find((stage) => stage.key === 'completed')?.rate ?? 0;
		const abandonedRate = funnel.stages.find((stage) => stage.key === 'abandoned')?.rate ?? 0;

		const alerts: string[] = [];
		if (startedRate < 60) alerts.push('La principal fuga ocurre antes del primer arranque de la actividad.');
		if (completedRate < 50) alerts.push('Menos de la mitad de la cohorte llega a completar la actividad.');
		if (abandonedRate >= 20) alerts.push('El abandono registrado es alto para esta actividad.');

		return {
			activityId: params.activityId,
			activityName: overview.activity.name,
			summary: {
				totalEnrolledStudents: overview.totalEnrolledStudents,
				startedRate,
				completedRate,
				abandonedRate,
				averageDaysToStart: funnel.averages.daysToStart,
				averageDaysToAbandon: funnel.averages.daysToAbandon
			},
			items: funnel.stages,
			transitions: funnel.transitions,
			alerts,
			recommendedActions: [
				...(startedRate < 60 ? ['Simplificar el arranque y visibilizar mejor la primera accion esperada.'] : []),
				...(abandonedRate >= 20
					? ['Revisar el punto medio de la actividad para localizar fricciones de abandono.']
					: []),
				...(completedRate < 50
					? ['Acompanar con feedback intermedio o checkpoints antes del cierre.']
					: [])
			],
			abandonedStudents: abandonedItems,
			limitations: [
				'El embudo usa el estado de progreso y la evidencia registrada, no eventos de paso finos.',
				'La fase "activos" combina actividad reciente y progreso abierto.'
			]
		};
	}

	static async getStudentAttemptHistory(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentId: string;
			dateFrom?: string;
			dateTo?: string;
			includeEvidenceExcerpts?: boolean;
		}
	) {
		const [overview, transcripts] = await Promise.all([
			LearningEvidenceService.getActivityEvidenceOverview(access, params.activityId, [params.studentId]),
			LearningEvidenceService.getActivityTranscripts(access, {
				activityId: params.activityId,
				studentIds: [params.studentId],
				dateFrom: params.dateFrom,
				dateTo: params.dateTo
			})
		]);

		const studentSummary = overview.studentSummaries.find((student) => student.userId === params.studentId);
		if (!studentSummary) {
			throw new Error('No se encontro al estudiante solicitado en la actividad.');
		}

		const timeline = [...transcripts]
			.sort((a, b) => new Date(a.sessionStartedAt).getTime() - new Date(b.sessionStartedAt).getTime())
			.map((session, index, sessions) => {
				const previous = sessions[index - 1];
				const repeatedLearnerTurns = extractRepeatedLearnerTurns(session.messages);
				const toolFailureCount = session.messages.reduce((count, message) => {
					for (const part of message.parts) {
						if (part.kind === 'tool-result' && (part.status === 'failed' || Boolean(part.errorMessage))) {
							return count + 1;
						}
					}
					return count;
				}, 0);
				const endedWithoutAssistant = (session.messages.at(-1)?.role ?? 'assistant') !== 'assistant';

				const deltaLearnerMessages = previous
					? session.learnerMessageCount - previous.learnerMessageCount
					: null;
				const previousToolFailureCount = previous
					? previous.messages.reduce((count, message) => {
							for (const part of message.parts) {
								if (part.kind === 'tool-result' && (part.status === 'failed' || Boolean(part.errorMessage))) {
									return count + 1;
								}
							}
							return count;
						}, 0)
					: null;
				const deltaToolFailures =
					previousToolFailureCount === null ? null : toolFailureCount - previousToolFailureCount;

				return {
					attemptNumber: index + 1,
					chatId: session.chatId,
					sessionStartedAt: session.sessionStartedAt,
					sessionUpdatedAt: session.sessionUpdatedAt,
					learnerMessageCount: session.learnerMessageCount,
					assistantMessageCount: session.assistantMessageCount,
					toolCallCount: session.toolCallCount,
					uiResponseCount: session.uiResponseCount,
					repeatedLearnerTurns,
					toolFailureCount,
					endedWithoutAssistant,
					deltaLearnerMessages,
					deltaToolFailures,
					excerpt: params.includeEvidenceExcerpts ? buildSessionExcerpt(session) : []
				};
			});

		const alerts: string[] = [];
		if (timeline.some((attempt) => attempt.toolFailureCount > 0)) {
			alerts.push('Hay intentos con fallos de herramienta.');
		}
		if (timeline.filter((attempt) => attempt.repeatedLearnerTurns > 0).length >= 2) {
			alerts.push('Se repiten reformulaciones en varios intentos, posible estancamiento conceptual.');
		}
		if (timeline.at(-1)?.endedWithoutAssistant) {
			alerts.push('El ultimo intento termina sin cierre claro del asistente.');
		}

		return {
			activityId: params.activityId,
			activityName: overview.activity.name,
			student: {
				userId: studentSummary.userId,
				username: studentSummary.username,
				email: studentSummary.email,
				alias: studentSummary.alias
			},
			summary: {
				progressStatus: studentSummary.progressStatus,
				attemptsCount: studentSummary.attemptsCount,
				sessionCount: studentSummary.sessionCount,
				timeSpentSeconds: studentSummary.timeSpentSeconds,
				firstActivityAt: studentSummary.firstActivityAt,
				lastActivityAt: studentSummary.lastActivityAt
			},
			items: timeline,
			alerts,
			recommendedActions: [
				...(studentSummary.progressStatus !== 'completed'
					? ['Revisar el ultimo intento y cerrar el siguiente paso pendiente con apoyo concreto.']
					: []),
				...(timeline.some((attempt) => attempt.toolFailureCount > 0)
					? ['Ofrecer una via alternativa cuando falle la herramienta o el componente interactivo.']
					: []),
				...(timeline.some((attempt) => attempt.repeatedLearnerTurns > 0)
					? ['Pedir una explicacion guiada del razonamiento antes de continuar al siguiente paso.']
					: [])
			],
			limitations: [
				'El historial agrupa los intentos a nivel de sesion, no por paso interno.',
				'Las mejoras se estiman comparando volumen de interaccion y friccion entre sesiones.'
			]
		};
	}

	static async analyzeToolFrictionHotspots(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentIds?: string[];
			dateFrom?: string;
			dateTo?: string;
			toolNames?: string[];
			maxResults?: number;
			includeEvidenceExcerpts?: boolean;
		}
	) {
		const [activity, transcripts] = await Promise.all([
			LearningEvidenceService.getActivityContext(access, params.activityId),
			LearningEvidenceService.getActivityTranscripts(access, {
				activityId: params.activityId,
				studentIds: params.studentIds,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo
			})
		]);

		const hotspots = analyzeToolFrictionHotspotsFromTranscripts(transcripts, {
			toolNames: params.toolNames,
			maxResults: params.maxResults,
			includeEvidenceExcerpts: params.includeEvidenceExcerpts
		});
		const alerts: string[] = [];
		if (hotspots.items.some((item) => item.frictionScore >= 70)) {
			alerts.push('Hay al menos un hotspot de friccion con severidad alta.');
		}
		if (hotspots.items.length === 0) {
			alerts.push('No se detectaron hotspots claros con el alcance actual.');
		}

		return {
			activityId: params.activityId,
			activityName: activity.name,
			summary: hotspots.summary,
			items: hotspots.items,
			alerts,
			recommendedActions: [
				...(hotspots.items.some((item) => item.kind === 'tool' && item.failureRate >= 25)
					? ['Priorizar la revision de herramientas con fallo frecuente antes de retocar la consigna.']
					: []),
				...(hotspots.items.some((item) => item.kind === 'ui' && item.pendingRate >= 40)
					? ['Revisar componentes renderizados sin respuesta o con baja respuesta del alumnado.']
					: [])
			],
			limitations: [
				'La friccion se infiere desde transcriptos y resultados de herramientas, no desde trazas de UI mas finas.',
				'Las correlaciones con atasco son heuristicas y no prueban causalidad.'
			]
		};
	}
}

export default ActivityMicroAnalyticsService;
