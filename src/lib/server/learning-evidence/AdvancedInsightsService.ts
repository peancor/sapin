import { ActivityAnalyticsService } from '$lib/server/learning-evidence/ActivityAnalyticsService';
import { LearningEvidenceService } from '$lib/server/learning-evidence';
import type {
	LearningEvidenceAccessContext,
	LearningEvidenceTranscriptSession
} from '$lib/types/learningEvidence';

type StudentProfile = Awaited<
	ReturnType<typeof ActivityAnalyticsService.getActivityStudentProfiles>
>['students'][number];

type RubricCriterionInput = {
	id?: string;
	title: string;
	description?: string;
	maxScore?: number;
	keywords?: string[];
};

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
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
			normalizeText(source)
				.split(' ')
				.filter((token) => token.length >= 4 && !stopwords.has(token))
		)
	].slice(0, 8);
}

function scoreSeverity(score: number): 'low' | 'medium' | 'high' {
	if (score >= 70) return 'high';
	if (score >= 40) return 'medium';
	return 'low';
}

function daysSince(value: string | null): number | null {
	if (!value) return null;
	const diff = Date.now() - new Date(value).getTime();
	return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

function getUserCorpusFromSessions(
	sessions: LearningEvidenceTranscriptSession[],
	chatId?: string
): { text: string; evidence: string[] } {
	const selectedSessions = chatId ? sessions.filter((session) => session.chatId === chatId) : sessions;
	const userMessages = selectedSessions.flatMap((session) =>
		session.messages
			.filter((message) => message.role === 'user')
			.map((message) => message.displayText)
	);
	const text = userMessages.join('\n\n').trim();
	const evidence = splitSentences(text).slice(0, 24);
	return { text, evidence };
}

function buildRiskFactors(
	profile: StudentProfile,
	stuckCount: number
): Array<{ type: string; severity: 'low' | 'medium' | 'high'; description: string; weight: number }> {
	const factors: Array<{ type: string; severity: 'low' | 'medium' | 'high'; description: string; weight: number }> = [];
	const inactivityDays = daysSince(profile.lastActivityAt);

	if (profile.status === 'not_started') {
		factors.push({
			type: 'not_started',
			severity: 'high',
			description: 'No hay progreso registrado en la actividad.',
			weight: 55
		});
	}

	if (profile.status === 'abandoned') {
		factors.push({
			type: 'abandoned',
			severity: 'high',
			description: 'El progreso aparece marcado como abandonado.',
			weight: 70
		});
	}

	if (profile.status === 'in_progress') {
		factors.push({
			type: 'in_progress',
			severity: 'medium',
			description: 'La actividad sigue abierta sin completarse.',
			weight: 20
		});
	}

	if ((profile.attemptsCount ?? 0) >= 3) {
		factors.push({
			type: 'retries',
			severity: 'medium',
			description: `Acumula ${profile.attemptsCount} intentos.`,
			weight: 20
		});
	}

	if (stuckCount > 0) {
		factors.push({
			type: 'stuck_sessions',
			severity: stuckCount >= 2 ? 'high' : 'medium',
			description: `Tiene ${stuckCount} sesion(es) con senales de atasco.`,
			weight: stuckCount >= 2 ? 30 : 20
		});
	}

	if ((profile.learnerMessageCount ?? 0) === 0 && profile.sessionCount > 0) {
		factors.push({
			type: 'no_substantive_input',
			severity: 'medium',
			description: 'Hay sesiones sin aportaciones sustantivas del estudiante.',
			weight: 15
		});
	}

	if ((profile.averageLearnerMessageLength ?? 0) > 0 && profile.averageLearnerMessageLength < 45) {
		factors.push({
			type: 'brief_answers',
			severity: 'medium',
			description: 'Las respuestas del estudiante son muy breves.',
			weight: 10
		});
	}

	if (inactivityDays !== null && inactivityDays >= 7 && profile.status !== 'completed') {
		factors.push({
			type: 'inactivity',
			severity: inactivityDays >= 14 ? 'high' : 'medium',
			description: `No hay actividad reciente desde hace ${inactivityDays} dia(s).`,
			weight: inactivityDays >= 14 ? 30 : 18
		});
	}

	return factors;
}

function riskScoreFromFactors(profile: StudentProfile, stuckCount: number) {
	const factors = buildRiskFactors(profile, stuckCount);
	let score = factors.reduce((sum, factor) => sum + factor.weight, 0);

	if (profile.status === 'completed') score -= 40;
	if ((profile.engagementScore ?? 0) >= 70) score -= 15;
	if ((profile.scoreRaw ?? 0) >= 80) score -= 10;

	score = clamp(score, 0, 100);

	return {
		riskScore: score,
		riskLevel: scoreSeverity(score),
		factors: factors.map(({ weight: _weight, ...factor }) => factor)
	};
}

export class AdvancedInsightsService {
	static async rubricEvaluateResponse(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentId?: string;
			chatId?: string;
			responseText?: string;
			rubric: RubricCriterionInput[];
		}
	) {
		if (!Array.isArray(params.rubric) || params.rubric.length === 0) {
			throw new Error('La evaluacion por rubrica requiere al menos un criterio.');
		}

		const activity = await LearningEvidenceService.getActivityContext(access, params.activityId);
		const sessions =
			params.responseText && !params.studentId && !params.chatId
				? []
				: await LearningEvidenceService.getActivityTranscripts(access, {
						activityId: params.activityId,
						studentIds: params.studentId ? [params.studentId] : undefined,
						chatIds: params.chatId ? [params.chatId] : undefined
					});

		const student = sessions[0]?.student ?? null;
		const corpus = params.responseText?.trim()
			? { text: params.responseText.trim(), evidence: splitSentences(params.responseText.trim()) }
			: getUserCorpusFromSessions(sessions, params.chatId);

		if (!corpus.text) {
			throw new Error('No hay respuesta textual suficiente para evaluar con la rubrica.');
		}

		const normalizedCorpus = normalizeText(corpus.text);
		const totalMaxScore = params.rubric.reduce((sum, criterion) => sum + (criterion.maxScore ?? 4), 0);

		const criteria = params.rubric.map((criterion, index) => {
			const keywords = extractKeywords(criterion);
			const matchedKeywords = keywords.filter((keyword) =>
				normalizedCorpus.includes(normalizeText(keyword))
			);
			const evidenceSnippets = corpus.evidence
				.filter((snippet) =>
					matchedKeywords.some((keyword) => normalizeText(snippet).includes(normalizeText(keyword)))
				)
				.slice(0, 3);
			const maxScore = criterion.maxScore ?? 4;
			const keywordCoverage =
				keywords.length > 0 ? matchedKeywords.length / keywords.length : corpus.text.length >= 120 ? 0.7 : 0.4;
			const baseCoverage = corpus.text.length >= 240 ? 0.3 : corpus.text.length >= 120 ? 0.2 : 0.1;
			const provisionalScore = clamp(
				Math.round(maxScore * clamp(baseCoverage + keywordCoverage * 0.7, 0, 1)),
				0,
				maxScore
			);

			return {
				id: criterion.id ?? `criterion_${index + 1}`,
				title: criterion.title,
				description: criterion.description ?? '',
				maxScore,
				provisionalScore,
				confidence:
					evidenceSnippets.length > 0
						? matchedKeywords.length >= Math.max(1, Math.ceil(keywords.length / 2))
							? 'medium'
							: 'low'
						: 'low',
				matchedKeywords,
				evidenceSnippets,
				rationale:
					evidenceSnippets.length > 0
						? `Se localizaron senales textuales relacionadas con el criterio: ${matchedKeywords.join(', ')}.`
						: 'No se localizaron evidencias textuales claras para este criterio.'
			};
		});

		const provisionalTotalScore = criteria.reduce((sum, criterion) => sum + criterion.provisionalScore, 0);

		return {
			activityId: params.activityId,
			activityName: activity.name,
			student,
			chatId: params.chatId ?? sessions[0]?.chatId ?? null,
			evaluationMode: params.responseText ? 'provided_text' : 'evidence_transcript',
			provisional: true,
			scale: {
				totalMaxScore,
				provisionalTotalScore,
				provisionalPercentage:
					totalMaxScore > 0 ? Math.round((provisionalTotalScore / totalMaxScore) * 100) : 0
			},
			criteria,
			limitations: [
				'La puntuacion es provisional y heuristica; no sustituye una revision docente.',
				'La herramienta solo puede valorar la evidencia textual disponible en el alcance actual.'
			]
		};
	}

	static async findInconsistentGradingCases(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			scoreGapThreshold?: number;
			maxResults?: number;
		}
	) {
		const profiles = await ActivityAnalyticsService.getActivityStudentProfiles(access, {
			activityId: params.activityId
		});
		const threshold = params.scoreGapThreshold ?? 30;
		const maxResults = params.maxResults ?? 12;
		const candidates = profiles.students.filter((student) => student.scoreRaw !== null);
		const cases: Array<{
			type: string;
			severity: 'low' | 'medium' | 'high';
			description: string;
			students: Array<{
				student: StudentProfile['student'];
				scoreRaw: number | null;
				status: string;
				engagementScore: number;
				learnerMessageCount: number;
				attemptsCount: number;
			}>;
		}> = [];

		for (const student of candidates) {
			if ((student.scoreRaw ?? 0) >= 85 && (student.engagementScore ?? 0) < 35) {
				cases.push({
					type: 'high_score_low_engagement',
					severity: 'medium',
					description:
						'Nota alta con muy poca participacion o engagement, conviene revisar la consistencia de la evaluacion.',
					students: [
						{
							student: student.student,
							scoreRaw: student.scoreRaw,
							status: student.status,
							engagementScore: student.engagementScore,
							learnerMessageCount: student.learnerMessageCount,
							attemptsCount: student.attemptsCount
						}
					]
				});
			}

			if ((student.scoreRaw ?? 100) <= 40 && (student.engagementScore ?? 0) >= 70) {
				cases.push({
					type: 'low_score_high_engagement',
					severity: 'medium',
					description:
						'Nota baja pese a una participacion sostenida; puede haber una desalineacion entre evidencia y calificacion.',
					students: [
						{
							student: student.student,
							scoreRaw: student.scoreRaw,
							status: student.status,
							engagementScore: student.engagementScore,
							learnerMessageCount: student.learnerMessageCount,
							attemptsCount: student.attemptsCount
						}
					]
				});
			}
		}

		for (let i = 0; i < candidates.length; i++) {
			for (let j = i + 1; j < candidates.length; j++) {
				const a = candidates[i];
				const b = candidates[j];
				if (a.status !== b.status) continue;
				const similarEvidence =
					Math.abs(a.engagementScore - b.engagementScore) <= 15 &&
					Math.abs(a.learnerMessageCount - b.learnerMessageCount) <= 3 &&
					Math.abs(a.attemptsCount - b.attemptsCount) <= 1;
				if (!similarEvidence) continue;

				const scoreGap = Math.abs((a.scoreRaw ?? 0) - (b.scoreRaw ?? 0));
				if (scoreGap < threshold) continue;

				cases.push({
					type: 'peer_score_gap',
					severity: scoreGap >= threshold + 20 ? 'high' : 'medium',
					description: `Dos estudiantes con evidencia parecida presentan una diferencia de ${scoreGap} puntos en la calificacion.`,
					students: [a, b].map((student) => ({
						student: student.student,
						scoreRaw: student.scoreRaw,
						status: student.status,
						engagementScore: student.engagementScore,
						learnerMessageCount: student.learnerMessageCount,
						attemptsCount: student.attemptsCount
					}))
				});
			}
		}

		const uniqueCases = cases
			.sort((a, b) => {
				const severityRank = { high: 0, medium: 1, low: 2 };
				return severityRank[a.severity] - severityRank[b.severity];
			})
			.slice(0, maxResults);

		return {
			activityId: params.activityId,
			activityName: profiles.activityName,
			totalReviewedStudents: candidates.length,
			totalCases: uniqueCases.length,
			cases: uniqueCases
		};
	}

	static async forecastCompletionRisk(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentIds?: string[];
			maxResults?: number;
			includeCompleted?: boolean;
		}
	) {
		const profiles = await ActivityAnalyticsService.getActivityStudentProfiles(access, {
			activityId: params.activityId,
			studentIds: params.studentIds
		});
		const stuckSessions = await ActivityAnalyticsService.findStuckSessions(access, {
			activityId: params.activityId,
			studentIds: params.studentIds,
			maxResults: 200,
			minScore: 35
		});
		const stuckByStudent = new Map<string, number>();
		for (const session of stuckSessions.sessions) {
			stuckByStudent.set(session.student.userId, (stuckByStudent.get(session.student.userId) ?? 0) + 1);
		}

		const includeCompleted = params.includeCompleted ?? false;
		const students = profiles.students
			.filter((student) => includeCompleted || student.status !== 'completed')
			.map((student) => {
				const risk = riskScoreFromFactors(student, stuckByStudent.get(student.student.userId) ?? 0);
				const completionProbability =
					student.status === 'completed'
						? 100
						: clamp(
								100 -
									risk.riskScore +
									(student.status === 'in_progress' ? 10 : 0) +
									(student.sessionCount > 0 ? 5 : 0),
								0,
								100
							);

				return {
					student: student.student,
					status: student.status,
					riskLevel: risk.riskLevel,
					riskScore: risk.riskScore,
					completionProbability,
					engagementScore: student.engagementScore,
					attemptsCount: student.attemptsCount,
					lastActivityAt: student.lastActivityAt,
					factors: risk.factors
				};
			})
			.sort((a, b) => b.riskScore - a.riskScore || a.student.username.localeCompare(b.student.username))
			.slice(0, params.maxResults ?? profiles.students.length);

		return {
			activityId: params.activityId,
			activityName: profiles.activityName,
			totalStudents: profiles.totalStudents,
			students
		};
	}

	static async clusterInteractionPatterns(
		access: LearningEvidenceAccessContext,
		params: {
			activityId: string;
			studentIds?: string[];
			includeMembers?: boolean;
		}
	) {
		const profiles = await ActivityAnalyticsService.getActivityStudentProfiles(access, {
			activityId: params.activityId,
			studentIds: params.studentIds
		});
		const stuckSessions = await ActivityAnalyticsService.findStuckSessions(access, {
			activityId: params.activityId,
			studentIds: params.studentIds,
			maxResults: 200,
			minScore: 35
		});
		const stuckByStudent = new Map<string, number>();
		for (const session of stuckSessions.sessions) {
			stuckByStudent.set(session.student.userId, (stuckByStudent.get(session.student.userId) ?? 0) + 1);
		}

		const clusters = new Map<
			string,
			{
				label: string;
				description: string;
				members: StudentProfile[];
			}
		>();

		const ensureCluster = (key: string, label: string, description: string) => {
			const current = clusters.get(key);
			if (current) return current;
			const created = { label, description, members: [] as StudentProfile[] };
			clusters.set(key, created);
			return created;
		};

		for (const profile of profiles.students) {
			const stuckCount = stuckByStudent.get(profile.student.userId) ?? 0;
			let key = 'steady_progressors';
			let label = 'Steady progressors';
			let description = 'Participacion sostenida, sin grandes senales de bloqueo.';

			if (profile.sessionCount === 0) {
				key = 'inactive_students';
				label = 'Inactive students';
				description = 'Sin sesiones o evidencia util en la actividad.';
			} else if (profile.status === 'completed' && profile.engagementScore >= 70) {
				key = 'confident_completers';
				label = 'Confident completers';
				description = 'Completan la actividad con buena participacion y poca friccion.';
			} else if (stuckCount > 0 || profile.attemptsCount >= 3) {
				key = 'blocked_iterators';
				label = 'Blocked iterators';
				description = 'Reintentan y muestran senales de atasco o resolucion incompleta.';
			} else if (profile.toolCallCount >= 4 || profile.uiResponseCount >= 2) {
				key = 'exploratory_tool_users';
				label = 'Exploratory tool users';
				description = 'Exploran el entorno interactivo y usan varias herramientas o componentes.';
			} else if (profile.averageLearnerMessageLength < 50 && profile.learnerMessageCount <= 3) {
				key = 'minimal_participants';
				label = 'Minimal participants';
				description = 'Participan, pero con muy poca elaboracion o profundidad textual.';
			}

			ensureCluster(key, label, description).members.push(profile);
		}

		const result = [...clusters.entries()].map(([key, cluster]) => ({
			key,
			label: cluster.label,
			description: cluster.description,
			studentCount: cluster.members.length,
			averageEngagementScore: Math.round(
				cluster.members.reduce((sum, member) => sum + member.engagementScore, 0) /
					Math.max(cluster.members.length, 1)
			),
			completedCount: cluster.members.filter((member) => member.status === 'completed').length,
			inProgressCount: cluster.members.filter((member) => member.status === 'in_progress').length,
			members: params.includeMembers
				? cluster.members.map((member) => ({
						student: member.student,
						status: member.status,
						engagementScore: member.engagementScore,
						learnerMessageCount: member.learnerMessageCount,
						toolCallCount: member.toolCallCount,
						attemptsCount: member.attemptsCount
					}))
				: undefined
		}));

		return {
			activityId: params.activityId,
			activityName: profiles.activityName,
			totalStudents: profiles.totalStudents,
			clusters: result.sort((a, b) => b.studentCount - a.studentCount || a.label.localeCompare(b.label))
		};
	}
}
