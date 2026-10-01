import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { DBAgentToolUtils } from '$lib/server/db/agent';
import { DBInsightsAgentUtils } from '$lib/server/db/insights-agent';

export const load = (async ({ parent, params, locals, url }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const { course, interactive } = await parent();
	const config = await DBInsightsAgentUtils.getConfigDTO(params.ilid);
	const models = await AIUtils.getAvailableModels();
	const availableTools = (await DBAgentToolUtils.getActiveToolDefinitions())
		.filter((tool) => DBInsightsAgentUtils.isToolAllowedForInsightsAgent(tool))
		.map((tool) => ({
			id: tool.id,
			displayName: tool.displayName,
			description: tool.description,
			category: tool.category,
			usageDomain: tool.usageDomain,
			riskLevel: tool.riskLevel,
			requiresConfirmation: tool.requiresConfirmation
		}));

	return {
		courseId: course.id,
		interactive,
		config,
		models: models.map((model) => model.name),
		availableTools,
		returnToRunId: url.searchParams.get('run')
	};
}) satisfies PageServerLoad;
