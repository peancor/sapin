import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type { LearningEvidenceAccessContext } from '$lib/types/learningEvidence';
import { StaffAgentAnalyticsService } from '$lib/server/staff-agent';
import { ActivityAnalyticsService } from './ActivityAnalyticsService';
import { ActivityMicroAnalyticsService } from './ActivityMicroAnalyticsService';
import { AdvancedInsightsService } from './AdvancedInsightsService';
import { LearningEvidenceService } from './LearningEvidenceService';
import { PedagogicalDiagnosticsService } from './PedagogicalDiagnosticsService';
import { daysSince } from './operationalAnalytics';

function priorityLabel(score: number): 'low' | 'medium' | 'high' {
	if (score >= 75) return 'high';
	if (score >= 45) return 'medium';
	return 'low';
}

function priorityWeight(priority: 'low' | 'medium' | 'high') {
	if (priority === 'high') return 75;
	if (priority === 'medium') return 45;
	return 0;
}

function buildDisplayName(student: { username: string; alias?: string }) {
	return student.alias?.trim() || student.username;
}

async function getOrderedCourseActivities(courseId: string) {
	return db
		.select({
			activityId: schema.interactiveLearning.id,
			activityName: schema.interactiveLearning.name,
			activityType: schema.interactiveLearning.type,
			status: schema.interactiveLearning.status,
			order: schema.courseInteractiveLearning.order
		})
		.from(schema.courseInteractiveLearning)
		.innerJoin(
			schema.interactiveLearning,
			eq(schema.courseInteractiveLearning.interactiveLearningId, schema.interactiveLearning.id)
		)
		.where(eq(schema.courseInteractiveLearning.courseId, courseId))
		.orderBy(schema.courseInteractiveLearning.order);
}

export class TeacherActionQueueService {
	static async getTeacherInterventionQueue(
		access: LearningEvidenceAccessContext,
		params: {
			courseId?: string;
			activityId?: string;
			studentIds?: string[];
			maxResults?: number;
			minPriority?: 'low' | 'medium' | 'high';
		}
	) {
		if (!params.courseId && !params.activityId) {
			throw new Error('La cola de intervencion requiere un courseId o un activityId.');
		}

		if (params.activityId) {
			return this.getActivityInterventionQueue(access, {
				activityId: params.activityId,
				studentIds: params.studentIds,
				maxResults: params.maxResults,
				minPriority: params.minPriority
			});
		}

		return this.getCourseInterventionQueue(access, {
			courseId: params.courseId!,
			studentIds: params.studentIds,
			maxResults: params.maxResults,
			minPriority: params.minPriority
		});
	}

	static async getCourseSequenceBottlenecks(
		access: LearningEvidenceAccessContext,
		params: {
			courseId: string;
		}
	) {
		const activities = await getOrderedCourseActivities(params.courseId);
		const items: Array<{
			activityId: string;
			activityName: string;
			order: number;
			participationRate: number;
			completionRate: number;
			abandonedRate: number;
			nonStarterRate: number;
			participationDeltaFromPrevious: number | null;
			completionDeltaFromPrevious: number | null;
			bottleneckScore: number;
			severity: 'low' | 'medium' | 'high';
			recommendedAction: string;
		}> = [];

		let previousParticipation: number | null = null;
		let previousCompletion: number | null = null;

		for (const activity of activities) {
			const overview = await LearningEvidenceService.getActivityEvidenceOverview(access, activity.activityId);
			const completed = overview.studentSummaries.filter((student) => student.progressStatus === 'completed').length;
			const abandoned = overview.studentSummaries.filter((student) => student.progressStatus === 'abandoned').length;
			const started = overview.studentSummaries.filter(
				(student) => student.progressStatus !== 'not_started' || student.sessionCount > 0
			).length;
			const participationRate =
				overview.totalEnrolledStudents > 0
					? Math.round((started / overview.totalEnrolledStudents) * 100)
					: 0;
			const completionRate =
				overview.totalEnrolledStudents > 0
					? Math.round((completed / overview.totalEnrolledStudents) * 100)
					: 0;
			const abandonedRate =
				overview.totalEnrolledStudents > 0
					? Math.round((abandoned / overview.totalEnrolledStudents) * 100)
					: 0;
			const nonStarterRate = Math.max(100 - participationRate, 0);
			const participationDeltaFromPrevious =
				previousParticipation === null ? null : participationRate - previousParticipation;
			const completionDeltaFromPrevious =
				previousCompletion === null ? null : completionRate - previousCompletion;
			const bottleneckScore = Math.max(
				0,
				Math.min(
					100,
					Math.round(
						nonStarterRate * 0.35 +
							(100 - completionRate) * 0.3 +
							abandonedRate * 0.2 +
							Math.max(0, -(participationDeltaFromPrevious ?? 0)) * 0.15
					)
				)
			);
			const severity = priorityLabel(bottleneckScore);

			items.push({
				activityId: activity.activityId,
				activityName: activity.activityName,
				order: activity.order,
				participationRate,
				completionRate,
				abandonedRate,
				nonStarterRate,
				participationDeltaFromPrevious,
				completionDeltaFromPrevious,
				bottleneckScore,
				severity,
				recommendedAction:
					nonStarterRate >= 35
						? 'Revisar arranque y consigna inicial.'
						: abandonedRate >= 20
							? 'Detectar el tramo medio con mas abandono y anadir apoyo intermedio.'
							: 'Revisar alineacion entre demanda cognitiva y scaffolding.'
			});

			previousParticipation = participationRate;
			previousCompletion = completionRate;
		}

		const topBottlenecks = [...items]
			.sort((a, b) => b.bottleneckScore - a.bottleneckScore || a.order - b.order)
			.slice(0, 5);

		return {
			courseId: params.courseId,
			summary: {
				totalActivities: items.length,
				highSeverityCount: items.filter((item) => item.severity === 'high').length,
				averageParticipationRate:
					items.length > 0
						? Math.round(items.reduce((sum, item) => sum + item.participationRate, 0) / items.length)
						: 0,
				averageCompletionRate:
					items.length > 0
						? Math.round(items.reduce((sum, item) => sum + item.completionRate, 0) / items.length)
						: 0
			},
			items,
			alerts: topBottlenecks
				.filter((item) => item.severity !== 'low')
				.map((item) => `La actividad "${item.activityName}" concentra una friccion secuencial relevante.`),
			recommendedActions: topBottlenecks.map((item) => ({
				activityId: item.activityId,
				activityName: item.activityName,
				action: item.recommendedAction
			})),
			limitations: [
				'Los cuellos de botella se infieren por tasas de participacion, finalizacion y abandono por actividad.',
				'No hay instrumentacion por paso interno, asi que el diagnostico es a nivel de actividad.'
			]
		};
	}

	static async recommendGroupInterventions(
		access: LearningEvidenceAccessContext,
		params: {
			courseId?: string;
			activityId?: string;
			studentIds?: string[];
			maxGroups?: number;
		}
	) {
		if (!params.courseId && !params.activityId) {
			throw new Error('La recomendacion de grupos requiere un courseId o un activityId.');
		}

		const maxGroups = Math.max(1, Math.min(params.maxGroups ?? 4, 6));

		if (params.activityId) {
			const [overview, risk, depth] = await Promise.all([
				LearningEvidenceService.getActivityEvidenceOverview(access, params.activityId, params.studentIds),
				AdvancedInsightsService.forecastCompletionRisk(access, {
					activityId: params.activityId,
					studentIds: params.studentIds,
					maxResults: 500,
					includeCompleted: true
				}),
				PedagogicalDiagnosticsService.measureResponseDepth(access, {
					activityId: params.activityId,
					studentIds: params.studentIds,
					includeEvidenceExcerpts: true
				})
			]);

			const riskByStudent = new Map(risk.students.map((item) => [item.student.userId, item]));
			const depthByStudent = new Map(depth.items.map((item) => [item.student.userId, item]));

			const groups = [
				{
					key: 'activation_group',
					label: 'Activation group',
					goal: 'Arrancar la actividad con alumnado que aun no empieza.',
					suggestedAction: 'Microtutoria breve para aclarar la primera accion y reducir incertidumbre inicial.',
					members: overview.studentSummaries.filter((student) => student.progressStatus === 'not_started')
				},
				{
					key: 'reengagement_group',
					label: 'Re-engagement group',
					goal: 'Recuperar alumnado con riesgo alto o abandono.',
					suggestedAction: 'Sesion guiada de desbloqueo con foco en el punto exacto de abandono.',
					members: overview.studentSummaries.filter((student) => {
						const riskEntry = riskByStudent.get(student.userId);
						return student.progressStatus === 'abandoned' || (riskEntry?.riskScore ?? 0) >= 70;
					})
				},
				{
					key: 'deepening_group',
					label: 'Deepening group',
					goal: 'Elevar la calidad de la respuesta en alumnado que participa pero elabora poco.',
					suggestedAction: 'Trabajar justificacion, ejemplos y explicacion del razonamiento con andamiaje corto.',
					members: overview.studentSummaries.filter((student) => {
						const depthEntry = depthByStudent.get(student.userId);
						return student.progressStatus !== 'not_started' && (depthEntry?.depthBand ?? 'shallow') === 'shallow';
					})
				},
				{
					key: 'peer_support_group',
					label: 'Peer support group',
					goal: 'Activar apoyo entre iguales con alumnado que completa y responde con cierta profundidad.',
					suggestedAction: 'Usar sus respuestas como modelos anonimizados o en parejas de apoyo.',
					members: overview.studentSummaries.filter((student) => {
						const depthEntry = depthByStudent.get(student.userId);
						const riskEntry = riskByStudent.get(student.userId);
						return (
							student.progressStatus === 'completed' &&
							(depthEntry?.depthScore ?? 0) >= 55 &&
							(riskEntry?.riskScore ?? 100) <= 35
						);
					})
				}
			]
				.map((group) => ({
					key: group.key,
					label: group.label,
					goal: group.goal,
					suggestedAction: group.suggestedAction,
					memberCount: group.members.length,
					members: group.members.slice(0, 12).map((student) => ({
						student: {
							userId: student.userId,
							username: student.username,
							email: student.email,
							alias: student.alias
						},
						displayName: buildDisplayName(student),
						progressStatus: student.progressStatus,
						depthBand: depthByStudent.get(student.userId)?.depthBand ?? 'shallow',
						riskScore: riskByStudent.get(student.userId)?.riskScore ?? null
					}))
				}))
				.filter((group) => group.memberCount > 0)
				.slice(0, maxGroups);

			return {
				activityId: params.activityId,
				summary: {
					totalGroups: groups.length,
					totalStudentsCovered: groups.reduce((sum, group) => sum + group.memberCount, 0)
				},
				items: groups,
				alerts: groups.length === 0 ? ['No se identificaron grupos operativos claros con el alcance actual.'] : [],
				recommendedActions: groups.map((group) => `${group.label}: ${group.suggestedAction}`),
				limitations: [
					'Los grupos se forman por heuristicas de riesgo, progreso y profundidad de respuesta.',
					'No se optimiza solapamiento entre grupos; el docente debe decidir la version final.'
				]
			};
		}

		const signals = await StaffAgentAnalyticsService.getCourseStudentSignals(access, {
			courseId: params.courseId!,
			studentIds: params.studentIds,
			limit: 500
		});

		const groups = [
			{
				key: 'activation_group',
				label: 'Activation group',
				goal: 'Activar alumnado con demasiadas actividades sin empezar.',
				suggestedAction: 'Poner foco en el siguiente paso accionable y calendarizar un primer arranque.',
				members: signals.students.filter(
					(student) => student.notStartedActivities >= Math.max(2, Math.ceil(student.totalActivities / 3))
				)
			},
			{
				key: 'reengagement_group',
				label: 'Re-engagement group',
				goal: 'Atender alumnado con alta puntuacion de seguimiento.',
				suggestedAction: 'Revisar con cada estudiante la actividad de mayor riesgo o menor avance.',
				members: signals.students.filter((student) => student.attentionScore >= 70)
			},
			{
				key: 'consolidation_group',
				label: 'Consolidation group',
				goal: 'Ayudar a alumnado que participa pero convierte poco en finalizacion.',
				suggestedAction: 'Trabajar estrategias de cierre, comprobacion y priorizacion de tareas.',
				members: signals.students.filter(
					(student) => student.participationRate >= 60 && student.completionRate < 50
				)
			},
			{
				key: 'peer_support_group',
				label: 'Peer support group',
				goal: 'Detectar alumnado que puede sostener apoyo entre iguales.',
				suggestedAction: 'Usarlos como referentes de proceso o feedback entre pares.',
				members: signals.students.filter((student) => student.excellenceScore >= 70)
			}
		]
			.map((group) => ({
				key: group.key,
				label: group.label,
				goal: group.goal,
				suggestedAction: group.suggestedAction,
				memberCount: group.members.length,
				members: group.members.slice(0, 12).map((student) => ({
					student: student.student,
					displayName: student.displayName,
					attentionScore: student.attentionScore,
					excellenceScore: student.excellenceScore,
					notStartedActivities: student.notStartedActivities
				}))
			}))
			.filter((group) => group.memberCount > 0)
			.slice(0, maxGroups);

		return {
			courseId: params.courseId,
			summary: {
				totalGroups: groups.length,
				totalStudentsCovered: groups.reduce((sum, group) => sum + group.memberCount, 0)
			},
			items: groups,
			alerts: groups.length === 0 ? ['No se identificaron grupos operativos claros con el alcance actual.'] : [],
			recommendedActions: groups.map((group) => `${group.label}: ${group.suggestedAction}`),
			limitations: [
				'Los grupos de curso se basan en senales agregadas por secuencia, no en trazas finas por actividad.',
				'Puede haber solapamiento entre grupos si un mismo estudiante presenta varias necesidades.'
			]
		};
	}

	private static async getActivityInterventionQueue(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentIds?: string[];
			maxResults?: number;
			minPriority?: 'low' | 'medium' | 'high';
		}
	) {
		const [overview, nonStarters, risk, stuck, depth] = await Promise.all([
			LearningEvidenceService.getActivityEvidenceOverview(access, params.activityId, params.studentIds),
			ActivityMicroAnalyticsService.getActivityNonStarters(access, {
				activityId: params.activityId,
				studentIds: params.studentIds
			}),
			AdvancedInsightsService.forecastCompletionRisk(access, {
				activityId: params.activityId,
				studentIds: params.studentIds,
				maxResults: 500,
				includeCompleted: true
			}),
			ActivityAnalyticsService.findStuckSessions(access, {
				activityId: params.activityId,
				studentIds: params.studentIds,
				maxResults: 200,
				minScore: 35
			}),
			PedagogicalDiagnosticsService.measureResponseDepth(access, {
				activityId: params.activityId,
				studentIds: params.studentIds,
				includeEvidenceExcerpts: true
			})
		]);

		const minPriority = priorityWeight(params.minPriority ?? 'low');
		const nonStartersByStudent = new Map(nonStarters.items.map((item) => [item.student.userId, item]));
		const riskByStudent = new Map(risk.students.map((item) => [item.student.userId, item]));
		const depthByStudent = new Map(depth.items.map((item) => [item.student.userId, item]));
		const stuckByStudent = new Map<string, typeof stuck.sessions>();
		for (const session of stuck.sessions) {
			const bucket = stuckByStudent.get(session.student.userId) ?? [];
			bucket.push(session);
			stuckByStudent.set(session.student.userId, bucket);
		}

		const queue = overview.studentSummaries
			.map((student) => {
				const nonStarter = nonStartersByStudent.get(student.userId);
				const riskEntry = riskByStudent.get(student.userId);
				const depthEntry = depthByStudent.get(student.userId);
				const stuckSessions = stuckByStudent.get(student.userId) ?? [];
				let priorityScore = 0;
				const reasons: string[] = [];
				const evidence: string[] = [];

				if (nonStarter) {
					priorityScore += nonStarter.priorityScore;
					reasons.push('No ha arrancado la actividad.');
					if (nonStarter.lastCourseActivityAt) {
						evidence.push(`Ultima actividad en el curso: ${nonStarter.lastCourseActivityAt}.`);
					}
				}

				if (riskEntry) {
					priorityScore += Math.round(riskEntry.riskScore * 0.55);
					if (riskEntry.riskScore >= 70) reasons.push('Presenta riesgo alto de no completar.');
					evidence.push(...riskEntry.factors.slice(0, 2).map((factor) => factor.description));
				}

				if (student.progressStatus === 'abandoned') {
					priorityScore += 20;
					reasons.push('El progreso aparece como abandonado.');
				}

				if (stuckSessions.length > 0) {
					priorityScore += Math.min(stuckSessions.length * 12, 24);
					reasons.push(`${stuckSessions.length} sesion(es) con senales de atasco.`);
					evidence.push(stuckSessions[0].reasons[0] ?? 'Se detectan senales de atasco.');
				}

				if ((depthEntry?.depthBand ?? 'shallow') === 'shallow' && student.learnerMessageCount > 0) {
					priorityScore += 12;
					reasons.push('Responde con poca elaboracion.');
					if (depthEntry?.representativeExcerpt) evidence.push(depthEntry.representativeExcerpt);
				}

				const inactivityDays = daysSince(student.lastActivityAt);
				if (student.progressStatus !== 'completed' && (inactivityDays ?? 0) >= 7) {
					priorityScore += inactivityDays! >= 14 ? 18 : 10;
					reasons.push(`No hay actividad reciente desde hace ${inactivityDays} dia(s).`);
				}

				const priority = priorityLabel(priorityScore);
				const actionSuggested = nonStarter
					? 'Activar el primer paso de la actividad con una instruccion concreta.'
					: student.progressStatus === 'abandoned' || stuckSessions.length > 0
						? 'Reabrir el trabajo desde el punto de atasco con acompanamiento.'
						: (depthEntry?.depthBand ?? 'shallow') === 'shallow'
							? 'Pedir justificacion y ejemplo antes de validar la siguiente respuesta.'
							: 'Hacer seguimiento ligero y comprobar siguiente entrega.';

				return {
					student: {
						userId: student.userId,
						username: student.username,
						email: student.email,
						alias: student.alias
					},
					displayName: buildDisplayName(student),
					priority,
					priorityScore,
					reasons: [...new Set(reasons)],
					actionSuggested,
					evidence: [...new Set(evidence)].slice(0, 3),
					lastActivityAt: student.lastActivityAt,
					progressStatus: student.progressStatus
				};
			})
			.filter((item) => item.priorityScore >= minPriority)
			.sort((a, b) => b.priorityScore - a.priorityScore || a.displayName.localeCompare(b.displayName))
			.slice(0, params.maxResults ?? 15);

		return {
			activityId: params.activityId,
			activityName: overview.activity.name,
			summary: {
				totalStudents: overview.totalEnrolledStudents,
				queueLength: queue.length,
				highPriorityCount: queue.filter((item) => item.priority === 'high').length
			},
			items: queue,
			alerts:
				queue.length === 0
					? ['No hay estudiantes que superen el umbral actual de prioridad.']
					: [],
			recommendedActions: queue.slice(0, 3).map((item) => `${item.displayName}: ${item.actionSuggested}`),
			limitations: [
				'La prioridad combina heuristicas de riesgo, no-arranque, atasco y recencia.',
				'La cola no sustituye el juicio docente sobre contexto personal o evaluativo.'
			]
		};
	}

	private static async getCourseInterventionQueue(
		access: LearningEvidenceAccessContext,
		params: {
			courseId: string;
			studentIds?: string[];
			maxResults?: number;
			minPriority?: 'low' | 'medium' | 'high';
		}
	) {
		const [signals, bottlenecks] = await Promise.all([
			StaffAgentAnalyticsService.getCourseStudentSignals(access, {
				courseId: params.courseId,
				studentIds: params.studentIds,
				limit: 500
			}),
			this.getCourseSequenceBottlenecks(access, {
				courseId: params.courseId
			})
		]);

		const minPriority = priorityWeight(params.minPriority ?? 'low');
		const firstBottleneck = bottlenecks.items
			.filter((item) => item.bottleneckScore >= 50)
			.sort((a, b) => b.bottleneckScore - a.bottleneckScore)[0];

		const queue = signals.students
			.map((student) => {
				let priorityScore = student.attentionScore;
				const reasons: string[] = [];
				const evidence: string[] = [];

				if (student.notStartedActivities >= Math.max(2, Math.ceil(student.totalActivities / 3))) {
					priorityScore += 15;
					reasons.push('Acumula demasiadas actividades sin empezar.');
				}
				if (student.averageRisk >= 70) {
					priorityScore += 10;
					reasons.push('El riesgo medio en sus actividades es alto.');
				}
				if (student.lastActivityAt && (daysSince(student.lastActivityAt) ?? 0) >= 10) {
					priorityScore += 10;
					reasons.push('No hay actividad reciente en el curso.');
				}
				if (firstBottleneck) {
					const bottleneckSignal = student.activitySignals.find(
						(activity) => activity.activityId === firstBottleneck.activityId
					);
					if (bottleneckSignal && bottleneckSignal.progressStatus !== 'completed') {
						priorityScore += 10;
						reasons.push(`Sigue sin superar el cuello de botella en "${firstBottleneck.activityName}".`);
						evidence.push(`Actividad foco: ${firstBottleneck.activityName}.`);
					}
				}

				evidence.push(
					`Completion rate ${student.completionRate}%.`,
					`Attention score ${student.attentionScore}.`
				);

				const priority = priorityLabel(priorityScore);
				const focusActivity = student.activitySignals
					.filter((activity) => activity.progressStatus !== 'completed')
					.sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))[0];

				return {
					student: student.student,
					displayName: student.displayName,
					priority,
					priorityScore,
					reasons: [...new Set(reasons)],
					actionSuggested: focusActivity
						? `Revisar primero la actividad "${focusActivity.activityName}" y definir el siguiente paso concreto.`
						: 'Hacer seguimiento global del ritmo y del cierre de actividades.',
					evidence: [...new Set(evidence)].slice(0, 3),
					focusActivity,
					lastActivityAt: student.lastActivityAt
				};
			})
			.filter((item) => item.priorityScore >= minPriority)
			.sort((a, b) => b.priorityScore - a.priorityScore || a.displayName.localeCompare(b.displayName))
			.slice(0, params.maxResults ?? 15);

		return {
			courseId: params.courseId,
			summary: {
				totalStudents: signals.totalStudents,
				queueLength: queue.length,
				highPriorityCount: queue.filter((item) => item.priority === 'high').length
			},
			items: queue,
			alerts:
				queue.length === 0
					? ['No hay estudiantes que superen el umbral actual de prioridad.']
					: [],
			recommendedActions: queue.slice(0, 3).map((item) => `${item.displayName}: ${item.actionSuggested}`),
			limitations: [
				'La cola de curso usa senales agregadas y el principal cuello de botella detectado.',
				'No incorpora contexto extraplataforma ni criterios evaluativos manuales.'
			]
		};
	}
}

export default TeacherActionQueueService;
