import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CourseInteractiveAuthUtils } from '$lib/server/db';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { DBInsightsAgentUtils } from '$lib/server/db/insights-agent';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals, params }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const [courseRelation] = await db
		.select({ courseId: schema.courseInteractiveLearning.courseId })
		.from(schema.courseInteractiveLearning)
		.where(eq(schema.courseInteractiveLearning.interactiveLearningId, params.ilid))
		.limit(1);

	if (!courseRelation?.courseId) {
		return json({ error: 'Actividad no asociada a un curso' }, { status: 404 });
	}

	const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
		user.id,
		courseRelation.courseId,
		params.ilid,
		user.highestRoleLevel
	);

	if (!access.allowed) {
		return json({ error: access.reason || 'Sin permisos' }, { status: 403 });
	}

	const config = await DBInsightsAgentUtils.getConfigDTO(params.ilid);
	return json({ config });
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Body JSON invalido' }, { status: 400 });
	}

	const courseId = body.courseId;
	if (typeof courseId !== 'string' || courseId.length === 0) {
		return json({ error: 'courseId es obligatorio' }, { status: 400 });
	}

	const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
		user.id,
		courseId,
		params.ilid,
		user.highestRoleLevel
	);

	if (!access.allowed) {
		return json({ error: access.reason || 'Sin permisos' }, { status: 403 });
	}

	const toolIds = Array.isArray(body.enabledToolIds)
		? body.enabledToolIds.filter((value: unknown): value is string => typeof value === 'string')
		: [];

	await DBInsightsAgentUtils.getOrCreateConfig(params.ilid);
	await DBInsightsAgentUtils.updateConfig(params.ilid, {
		llmRole: typeof body.llmRole === 'string' ? body.llmRole : null,
		llmInstructions: typeof body.llmInstructions === 'string' ? body.llmInstructions : null,
		llmContext: typeof body.llmContext === 'string' ? body.llmContext : null,
		systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : null,
		llmModel: typeof body.llmModel === 'string' ? body.llmModel : null,
		temperature: typeof body.temperature === 'number' ? body.temperature : null,
		maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : null,
		topP: typeof body.topP === 'number' ? body.topP : null,
		maxToolRoundtrips:
			typeof body.maxToolRoundtrips === 'number' && body.maxToolRoundtrips > 0
				? body.maxToolRoundtrips
				: 8,
		parallelToolCalls: Boolean(body.parallelToolCalls),
		toolChoice:
			body.toolChoice === 'required' || body.toolChoice === 'none' ? body.toolChoice : 'auto'
	});
	await DBInsightsAgentUtils.setActivityTools(params.ilid, toolIds);

	const config = await DBInsightsAgentUtils.getConfigDTO(params.ilid);
	return json({ config });
};
