import type {
	ActivityContext,
	ConsolidatedMetrics,
	ProcessedChatData,
	RiskFactor,
	RiskLevel,
	StudentAtRisk,
	StudentData,
	StudentMetrics
} from '$lib/types/insights';
import type {
	LearningEvidenceOverview,
	LearningEvidenceStudentSummary,
	LearningEvidenceTranscriptSession
} from '$lib/types/learningEvidence';

function calculateStudentMetrics(summary: LearningEvidenceStudentSummary): StudentMetrics {
	if (summary.sessionCount === 0 || summary.learnerMessageCount === 0) {
		return {
			totalMessages: 0,
			completionStatus: 'not_started',
			lastActivityAt: null,
			riskLevel: 'high',
			engagementScore: 0,
			avgMessageLength: 0,
			responseCount: 0
		};
	}

	let completionStatus: StudentMetrics['completionStatus'] = 'in_progress';
	if (summary.learnerMessageCount >= 5) {
		completionStatus = 'completed';
	}

	let engagementScore = 0;
	engagementScore += Math.min(summary.learnerMessageCount * 10, 40);
	engagementScore += Math.min(summary.averageLearnerMessageLength / 10, 30);
	if (summary.lastActivityAt) {
		const daysSinceActivity =
			(Date.now() - new Date(summary.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24);
		engagementScore += Math.max(30 - daysSinceActivity * 5, 0);
	}
	engagementScore = Math.min(Math.round(engagementScore), 100);

	let riskLevel: RiskLevel = 'low';
	if (engagementScore < 30 || summary.learnerMessageCount === 0) {
		riskLevel = 'high';
	} else if (engagementScore < 60 || summary.learnerMessageCount < 3) {
		riskLevel = 'medium';
	}

	if (summary.lastActivityAt) {
		const daysSinceActivity =
			(Date.now() - new Date(summary.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24);
		if (daysSinceActivity > 7) {
			riskLevel = 'high';
		} else if (daysSinceActivity > 3 && riskLevel === 'low') {
			riskLevel = 'medium';
		}
	}

	return {
		totalMessages: summary.learnerMessageCount,
		completionStatus,
		lastActivityAt: summary.lastActivityAt,
		riskLevel,
		engagementScore,
		avgMessageLength: summary.averageLearnerMessageLength,
		responseCount: summary.learnerMessageCount
	};
}

function generateRecommendedActions(riskFactors: RiskFactor[]): string[] {
	const actions = new Set<string>();

	for (const factor of riskFactors) {
		if (factor.type === 'no_activity') {
			actions.add('Contactar con el estudiante para comprobar bloqueos y reactivar su participación.');
		}
		if (factor.type === 'low_engagement') {
			actions.add('Revisar si la actividad necesita andamiaje adicional o instrucciones más concretas.');
		}
		if (factor.type === 'incomplete') {
			actions.add('Programar un seguimiento para cerrar la actividad o redefinir expectativas.');
		}
		if (factor.type === 'short_messages') {
			actions.add('Solicitar respuestas más desarrolladas con ejemplos o justificación explícita.');
		}
	}

	return [...actions];
}

function buildRiskFactors(
	summary: LearningEvidenceStudentSummary,
	metrics: StudentMetrics
): RiskFactor[] {
	const factors: RiskFactor[] = [];

	if (summary.learnerMessageCount === 0) {
		factors.push({
			type: 'no_activity',
			description: 'Sin actividad registrada',
			severity: 'high'
		});
		return factors;
	}

	if (summary.lastActivityAt) {
		const daysSinceActivity =
			(Date.now() - new Date(summary.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24);
		if (daysSinceActivity > 7) {
			factors.push({
				type: 'no_activity',
				description: `Sin actividad hace ${Math.round(daysSinceActivity)} dias`,
				severity: 'high'
			});
		} else if (daysSinceActivity > 3) {
			factors.push({
				type: 'no_activity',
				description: `Sin actividad hace ${Math.round(daysSinceActivity)} dias`,
				severity: 'medium'
			});
		}
	}

	if ((metrics.engagementScore ?? 0) < 30) {
		factors.push({
			type: 'low_engagement',
			description: `Engagement bajo (${metrics.engagementScore ?? 0}%)`,
			severity: 'high'
		});
	} else if ((metrics.engagementScore ?? 0) < 60) {
		factors.push({
			type: 'low_engagement',
			description: `Engagement moderado (${metrics.engagementScore ?? 0}%)`,
			severity: 'medium'
		});
	}

	if (summary.learnerMessageCount < 3) {
		factors.push({
			type: 'incomplete',
			description: 'Actividad no completada',
			severity: 'medium'
		});
	}

	if (summary.averageLearnerMessageLength < 50 && summary.learnerMessageCount > 0) {
		factors.push({
			type: 'short_messages',
			description: 'Mensajes muy cortos',
			severity: 'medium'
		});
	}

	return factors;
}

export function toInsightsActivityContext(overview: LearningEvidenceOverview): ActivityContext {
	return {
		name: overview.activity.name,
		description: overview.activity.description,
		systemPrompt: overview.activity.systemPrompt,
		llmRole: overview.activity.llmRole,
		llmInstructions: overview.activity.llmInstructions,
		llmContext: overview.activity.llmContext
	};
}

export function toInsightsStudentData(overview: LearningEvidenceOverview): StudentData[] {
	const students = overview.studentSummaries.map((summary) => ({
		id: summary.userId,
		username: summary.username,
		email: summary.email,
		alias: summary.alias,
		metrics: calculateStudentMetrics(summary)
	}));

	students.sort((a, b) => {
		const riskOrder = { high: 0, medium: 1, low: 2 };
		const riskDiff = riskOrder[a.metrics.riskLevel] - riskOrder[b.metrics.riskLevel];
		if (riskDiff !== 0) return riskDiff;
		return a.username.localeCompare(b.username);
	});

	return students;
}

export function toInsightsProcessedChats(
	sessions: LearningEvidenceTranscriptSession[]
): ProcessedChatData[] {
	return sessions.map((session) => ({
		studentUsername: session.student.username,
		studentId: session.student.userId,
		createdAt: session.sessionStartedAt,
		messages: session.messages.map((message) => ({
			type: message.role.toUpperCase(),
			content: message.displayText,
			createdAt: message.createdAt
		}))
	}));
}

export function toInsightsConsolidatedMetrics(
	overview: LearningEvidenceOverview
): ConsolidatedMetrics {
	const students = overview.studentSummaries.map((summary) => {
		const metrics = calculateStudentMetrics(summary);
		const riskFactors = buildRiskFactors(summary, metrics);
		return {
			summary,
			metrics,
			riskFactors
		};
	});

	const activeStudents = students.filter((student) => student.summary.learnerMessageCount > 0);
	const overallScore =
		activeStudents.length > 0
			? Math.round(
					activeStudents.reduce(
						(sum, student) => sum + (student.metrics.engagementScore ?? 0),
						0
					) / activeStudents.length
				)
			: 0;

	const messageFrequency =
		activeStudents.length > 0
			? students.reduce((sum, student) => sum + student.summary.learnerMessageCount, 0) /
				activeStudents.length
			: 0;

	const studentsAtRisk: StudentAtRisk[] = students
		.filter((student) => student.metrics.riskLevel !== 'low')
		.map((student) => ({
			student: {
				id: student.summary.userId,
				username: student.summary.username,
				email: student.summary.email,
				alias: student.summary.alias,
				metrics: student.metrics
			},
			riskFactors: student.riskFactors,
			recommendedActions: generateRecommendedActions(student.riskFactors)
		}));

	const riskDistribution = {
		high: students.filter((student) => student.metrics.riskLevel === 'high').length,
		medium: students.filter((student) => student.metrics.riskLevel === 'medium').length,
		low: students.filter((student) => student.metrics.riskLevel === 'low').length
	};

	return {
		engagement: {
			overallScore,
			participationRate:
				overview.totalEnrolledStudents > 0
					? (overview.studentsWithEvidenceCount / overview.totalEnrolledStudents) * 100
					: 0,
			averageSessionDuration: 0,
			messageFrequency,
			activeStudentsCount: activeStudents.length,
			inactiveStudentsCount: overview.totalEnrolledStudents - activeStudents.length
		},
		performance: {
			averageCompletionRate:
				overview.totalEnrolledStudents > 0
					? (students.filter((student) => student.metrics.completionStatus === 'completed').length /
							overview.totalEnrolledStudents) *
						100
					: 0,
			averageMessageQuality:
				activeStudents.length > 0
					? activeStudents.reduce(
							(sum, student) => sum + student.summary.averageLearnerMessageLength,
							0
						) / activeStudents.length
					: 0,
			topPerformers: students
				.filter((student) => student.metrics.riskLevel === 'low')
				.sort((a, b) => (b.metrics.engagementScore ?? 0) - (a.metrics.engagementScore ?? 0))
				.slice(0, 3)
				.map((student) => student.summary.username),
			strugglingStudents: studentsAtRisk.map((student) => student.student.username)
		},
		earlyWarning: {
			studentsAtRisk,
			totalAtRisk: studentsAtRisk.length,
			riskDistribution
		},
		participation: {
			completed: students.filter((student) => student.metrics.completionStatus === 'completed').length,
			inProgress: students.filter((student) => student.metrics.completionStatus === 'in_progress').length,
			notStarted: students.filter((student) => student.metrics.completionStatus === 'not_started').length
		}
	};
}
