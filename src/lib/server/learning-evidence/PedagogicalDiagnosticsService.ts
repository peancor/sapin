import type { LearningEvidenceAccessContext, LearningEvidenceTranscriptSession } from '$lib/types/learningEvidence';
import { LearningEvidenceService } from './LearningEvidenceService';
import {
	detectMisconceptionClustersFromTranscripts,
	measureResponseDepthFromTranscripts,
	normalizeComparableText,
	truncateText
} from './operationalAnalytics';

type RubricCriterionInput = {
	id?: string;
	title: string;
	description?: string;
	maxScore?: number;
	keywords?: string[];
};

function splitSentences(value: string): string[] {
	return value
		.split(/[\n\r]+|(?<=[.!?])\s+/)
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

function extractKeywords(criterion: RubricCriterionInput): string[] {
	const source = [criterion.title, criterion.description ?? '', ...(criterion.keywords ?? [])].join(' ');
	const stopwords = new Set([
		'about',
		'como',
		'con',
		'cuando',
		'donde',
		'from',
		'para',
		'pero',
		'porque',
		'that',
		'this',
		'with'
	]);

	return [
		...new Set(
			normalizeComparableText(source)
				.split(' ')
				.filter((token) => token.length >= 4 && !stopwords.has(token))
		)
	].slice(0, 8);
}

function getStudentCorpus(sessions: LearningEvidenceTranscriptSession[]) {
	const userMessages = sessions.flatMap((session) =>
		session.messages.filter((message) => message.role === 'user').map((message) => message.displayText)
	);
	const text = userMessages.join('\n\n').trim();
	return {
		text,
		evidence: splitSentences(text).slice(0, 24)
	};
}

export class PedagogicalDiagnosticsService {
	static async detectActivityMisconceptions(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentIds?: string[];
			dateFrom?: string;
			dateTo?: string;
			maxClusters?: number;
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

		const clusters = detectMisconceptionClustersFromTranscripts(
			transcripts,
			Math.max(1, Math.min(params.maxClusters ?? 6, 12))
		).map((cluster) => ({
			...cluster,
			excerpts: params.includeEvidenceExcerpts === false ? [] : cluster.excerpts
		}));

		return {
			activityId: params.activityId,
			activityName: activity.name,
			summary: {
				totalSessions: transcripts.length,
				totalClusters: clusters.length,
				highConfidenceClusters: clusters.filter((cluster) => cluster.confidence === 'high').length
			},
			items: clusters,
			alerts:
				clusters.length > 0
					? [
							'Las misconceptions detectadas son heuristicas y deben revisarse con criterio docente antes de intervenir.'
						]
					: ['No se detectaron patrones suficientemente repetidos con el alcance actual.'],
			recommendedActions: [
				...(clusters.length > 0
					? ['Revisar primero los clusters con mas estudiantes afectados y mayor confianza.']
					: []),
				...(clusters.some((cluster) => cluster.confidence === 'high')
					? ['Convertir los errores recurrentes en una mini-aclaracion o ejemplo guiado dentro de la actividad.']
					: [])
			],
			limitations: [
				'La deteccion es heuristica y se apoya en lenguaje de duda, repeticiones y patrones textuales.',
				'No sustituye una revision conceptual humana del contenido del curso.'
			]
		};
	}

	static async measureResponseDepth(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentIds?: string[];
			dateFrom?: string;
			dateTo?: string;
			includeEvidenceExcerpts?: boolean;
		}
	) {
		const [overview, transcripts] = await Promise.all([
			LearningEvidenceService.getActivityEvidenceOverview(access, params.activityId, params.studentIds),
			LearningEvidenceService.getActivityTranscripts(access, {
				activityId: params.activityId,
				studentIds: params.studentIds,
				dateFrom: params.dateFrom,
				dateTo: params.dateTo
			})
		]);

		const depthByStudent = new Map(
			measureResponseDepthFromTranscripts(transcripts).map((item) => [item.studentId, item])
		);

		const items = overview.studentSummaries
			.map((student) => {
				const depth = depthByStudent.get(student.userId);
				return {
					student: {
						userId: student.userId,
						username: student.username,
						email: student.email,
						alias: student.alias
					},
					progressStatus: student.progressStatus,
					sessionCount: student.sessionCount,
					depthScore: depth?.depthScore ?? 0,
					depthBand: depth?.depthBand ?? 'shallow',
					totalLearnerMessages: depth?.totalLearnerMessages ?? student.learnerMessageCount,
					averageMessageLength: depth?.averageMessageLength ?? student.averageLearnerMessageLength,
					justificationMarkers: depth?.justificationMarkers ?? 0,
					exampleMarkers: depth?.exampleMarkers ?? 0,
					selfCorrectionMarkers: depth?.selfCorrectionMarkers ?? 0,
					representativeExcerpt:
						params.includeEvidenceExcerpts === false ? null : (depth?.representativeExcerpt ?? null)
				};
			})
			.sort((a, b) => a.depthScore - b.depthScore || a.student.username.localeCompare(b.student.username));

		const depthDistribution = {
			shallow: items.filter((item) => item.depthBand === 'shallow').length,
			developing: items.filter((item) => item.depthBand === 'developing').length,
			deep: items.filter((item) => item.depthBand === 'deep').length
		};

		return {
			activityId: params.activityId,
			activityName: overview.activity.name,
			summary: {
				totalStudents: overview.totalEnrolledStudents,
				studentsWithResponses: items.filter((item) => item.totalLearnerMessages > 0).length,
				averageDepthScore:
					items.length > 0 ? Math.round(items.reduce((sum, item) => sum + item.depthScore, 0) / items.length) : 0,
				depthDistribution
			},
			items,
			alerts:
				depthDistribution.shallow > Math.max(2, Math.round(items.length * 0.4))
					? ['Una parte relevante de la cohorte responde con poca elaboracion o justificacion.']
					: [],
			recommendedActions: [
				...(depthDistribution.shallow > 0
					? ['Pedir explicitamente justificacion, ejemplo o razonamiento en la siguiente iteracion de la actividad.']
					: []),
				...(depthDistribution.deep > 0
					? ['Usar respuestas profundas como modelos anonimizados para elevar el nivel esperado.']
					: [])
			],
			limitations: [
				'La profundidad se estima desde rasgos textuales observables, no desde correccion conceptual.',
				'El alumnado con pocas respuestas puede aparecer como shallow aunque la actividad sea breve por diseno.'
			]
		};
	}

	static async getRubricCoverageGaps(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentIds?: string[];
			rubric: RubricCriterionInput[];
			includeEvidenceExcerpts?: boolean;
		}
	) {
		if (!Array.isArray(params.rubric) || params.rubric.length === 0) {
			throw new Error('La cobertura de rubrica requiere al menos un criterio.');
		}

		const [overview, transcripts] = await Promise.all([
			LearningEvidenceService.getActivityEvidenceOverview(access, params.activityId, params.studentIds),
			LearningEvidenceService.getActivityTranscripts(access, {
				activityId: params.activityId,
				studentIds: params.studentIds
			})
		]);

		const sessionsByStudent = new Map<string, LearningEvidenceTranscriptSession[]>();
		for (const session of transcripts) {
			const bucket = sessionsByStudent.get(session.student.userId) ?? [];
			bucket.push(session);
			sessionsByStudent.set(session.student.userId, bucket);
		}

		const activeStudents = overview.studentSummaries.filter((student) => student.learnerMessageCount > 0);
		const items = params.rubric.map((criterion, index) => {
			const keywords = extractKeywords(criterion);
			const coveredStudents: Array<{
				student: {
					userId: string;
					username: string;
					email: string;
					alias?: string;
				};
				evidence: string[];
			}> = [];

			for (const student of activeStudents) {
				const corpus = getStudentCorpus(sessionsByStudent.get(student.userId) ?? []);
				if (!corpus.text) continue;
				const normalizedCorpus = normalizeComparableText(corpus.text);
				const matchedKeywords = keywords.filter((keyword) => normalizedCorpus.includes(keyword));
				if (matchedKeywords.length === 0) continue;

				const evidence = corpus.evidence
					.filter((sentence) =>
						matchedKeywords.some((keyword) => normalizeComparableText(sentence).includes(keyword))
					)
					.slice(0, 2)
					.map((sentence) => truncateText(sentence, 180));

				coveredStudents.push({
					student: {
						userId: student.userId,
						username: student.username,
						email: student.email,
						alias: student.alias
					},
					evidence
				});
			}

			const coverageRate =
				activeStudents.length > 0 ? Math.round((coveredStudents.length / activeStudents.length) * 100) : 0;
			return {
				id: criterion.id ?? `criterion_${index + 1}`,
				title: criterion.title,
				description: criterion.description ?? '',
				keywords,
				coverageRate,
				coveredStudents: coveredStudents.length,
				gapSeverity: coverageRate < 25 ? 'high' : coverageRate < 50 ? 'medium' : 'low',
				examples:
					params.includeEvidenceExcerpts === false
						? []
						: coveredStudents.slice(0, 3).map((entry) => ({
								student: entry.student,
								evidence: entry.evidence
							}))
			};
		});

		return {
			activityId: params.activityId,
			activityName: overview.activity.name,
			summary: {
				totalCriteria: items.length,
				activeStudents: activeStudents.length,
				criteriaWithHighGap: items.filter((item) => item.gapSeverity === 'high').length,
				averageCoverageRate:
					items.length > 0 ? Math.round(items.reduce((sum, item) => sum + item.coverageRate, 0) / items.length) : 0
			},
			items: items.sort((a, b) => a.coverageRate - b.coverageRate || a.title.localeCompare(b.title)),
			alerts: items
				.filter((item) => item.gapSeverity === 'high')
				.slice(0, 3)
				.map((item) => `El criterio "${item.title}" aparece poco evidenciado en la cohorte.`),
			recommendedActions: [
				'Explicitar en la consigna que se espera evidencia observable para los criterios con menor cobertura.',
				'Usar ejemplos o prompts intermedios que hagan visible el criterio antes de evaluar.'
			],
			limitations: [
				'La cobertura se infiere por coincidencia de keywords y no sustituye una revision cualitativa de las respuestas.',
				'Si la rubrica usa lenguaje muy abstracto, conviene anadir keywords concretas para mejorar la deteccion.'
			]
		};
	}
}

export default PedagogicalDiagnosticsService;
