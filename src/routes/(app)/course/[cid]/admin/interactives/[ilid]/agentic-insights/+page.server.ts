import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { DBAgentToolUtils } from '$lib/server/db/agent';
import { DBInsightsAgentUtils } from '$lib/server/db/insights-agent';
import { LearningEvidenceService } from '$lib/server/learning-evidence';
import { InsightsAgentMessageService } from '$lib/server/insights-agent';
import {
	toInsightsActivityContext,
	toInsightsConsolidatedMetrics,
	toInsightsStudentData
} from '$lib/server/learning-evidence/insights';

export const load = (async ({ parent, params, url, locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const { interactive, course } = await parent();
	const { ilid } = params;

	const overview = await LearningEvidenceService.getActivityEvidenceOverview(
		{
			actorUserId: locals.user.id,
			actorHighestRoleLevel: locals.user.highestRoleLevel
		},
		ilid
	);

	const config = await DBInsightsAgentUtils.getConfigDTO(ilid);
	const runs = await DBInsightsAgentUtils.listRunsForActivity(ilid);
	const selectedRunId = url.searchParams.get('run');
	const selectedRunSummary =
		(selectedRunId ? runs.find((run) => run.id === selectedRunId) : null) ?? runs[0] ?? null;

	const selectedRun = selectedRunSummary
		? {
				...selectedRunSummary,
				messages: await InsightsAgentMessageService.getDisplayMessages(selectedRunSummary.chatId)
			}
		: null;

	const models = await AIUtils.getAvailableModels();
	const availableTools = (await DBAgentToolUtils.getActiveToolDefinitions())
		.filter((tool) => DBInsightsAgentUtils.isToolAllowedForInsightsAgent(tool))
		.map((tool) => ({
			id: tool.id,
			name: tool.name,
			displayName: tool.displayName,
			description: tool.description,
			category: tool.category,
			usageDomain: tool.usageDomain,
			riskLevel: tool.riskLevel,
			requiresConfirmation: tool.requiresConfirmation
		}));

	return {
		courseId: course.id,
		viewerUserId: locals.user.id,
		interactive,
		config,
		models: models.map((model) => model.name),
		availableTools,
		runs,
		selectedRun,
		students: toInsightsStudentData(overview),
		metrics: toInsightsConsolidatedMetrics(overview),
		activityContext: toInsightsActivityContext(overview),
		overview: {
			totalEnrolledStudents: overview.totalEnrolledStudents,
			studentsWithEvidenceCount: overview.studentsWithEvidenceCount,
			totalSessions: overview.totalSessions,
			totalMessages: overview.totalMessages,
			lastActivityAt: overview.lastActivityAt
		}
	};
}) satisfies PageServerLoad;
