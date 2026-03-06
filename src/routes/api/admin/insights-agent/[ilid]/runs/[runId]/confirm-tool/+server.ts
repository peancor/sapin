import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CourseInteractiveAuthUtils } from '$lib/server/db';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { DBAgentMessageUtils } from '$lib/server/db/agent';
import { DBInsightsAgentUtils } from '$lib/server/db/insights-agent';
import { ToolExecutor } from '$lib/server/agent/ToolExecutor';
import type { AgentContext } from '$lib/types/agent';

export const POST: RequestHandler = async ({ locals, params, request }) => {
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
		return json({ error: access.reason || 'Sin acceso' }, { status: 403 });
	}

	const run = await DBInsightsAgentUtils.getRunForActivity(params.runId, params.ilid);
	if (!run) return json({ error: 'Run no encontrado' }, { status: 404 });
	if (run.createdByUserId !== user.id) {
		return json({ error: 'Solo el creador del run puede continuarlo' }, { status: 403 });
	}

	let body: { toolCallId: string; approved: boolean; rejectionReason?: string };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'Body JSON invalido' }, { status: 400 });
	}

	const toolCall = await DBAgentMessageUtils.getToolCall(body.toolCallId);
	if (!toolCall) return json({ error: 'Tool call no encontrado' }, { status: 404 });
	if (toolCall.status !== 'awaiting_confirmation') {
		return json({ error: `Tool call en estado "${toolCall.status}"` }, { status: 409 });
	}

	if (!body.approved) {
		await DBAgentMessageUtils.updateToolCall(body.toolCallId, {
			status: 'rejected',
			errorMessage: body.rejectionReason ?? 'Rechazado por un administrador',
			confirmedAt: new Date()
		});
		await DBAgentMessageUtils.saveAgentMessage({
			chatId: run.chatId,
			role: 'tool',
			textContent: JSON.stringify({
				rejected: true,
				reason: body.rejectionReason ?? 'El administrador rechazo la ejecucion.'
			}),
			toolCallId: body.toolCallId,
			toolName: toolCall.toolName,
			sequenceOrder: 3
		});
		await DBInsightsAgentUtils.touchRun(run.id, { status: 'paused' });
		return json({ success: true, rejected: true });
	}

	await DBAgentMessageUtils.updateToolCall(body.toolCallId, {
		status: 'executing',
		confirmedBy: user.id,
		confirmedAt: new Date()
	});

	const config = await DBInsightsAgentUtils.getOrCreateConfig(params.ilid);
	const enabledTools = await DBInsightsAgentUtils.getEnabledToolsForActivity(params.ilid);

	let toolArgs: Record<string, unknown> = {};
	try {
		toolArgs = JSON.parse(toolCall.arguments) as Record<string, unknown>;
	} catch {
		toolArgs = {};
	}

	const context: AgentContext = {
		userId: user.id,
		courseId: courseRelation.courseId,
		chatId: run.chatId,
		activityId: params.ilid,
		activityConfig: {
			llmModel: config.llmModel,
			llmRole: config.llmRole,
			llmInstructions: config.llmInstructions,
			llmContext: config.llmContext,
			systemPrompt: config.systemPrompt,
			temperature: config.temperature,
			maxTokens: config.maxTokens,
			topP: config.topP,
			maxToolRoundtrips: config.maxToolRoundtrips,
			parallelToolCalls: config.parallelToolCalls,
			toolChoice: config.toolChoice as 'auto' | 'required' | 'none',
			finalizationEnabled: false,
			finalizationToolName: 'finalize_activity',
			finalizationHandler: 'mark_complete_only',
			finalizationConfig: null,
			requireFinalizationToolCall: false,
			ragEnabled: false,
			ragCollectionName: null,
			ragConfig: null
		},
		enabledTools,
		enabledUIComponentKeys: [],
		messageHistory: []
	};

	const execution = await ToolExecutor.execute(toolCall.toolName, toolArgs, context);
	const resultData = execution.success ? execution.data : { error: execution.errorMessage };

	await DBAgentMessageUtils.updateToolCall(body.toolCallId, {
		result: JSON.stringify(resultData),
		status: execution.success ? 'completed' : 'failed',
		errorMessage: execution.success ? undefined : execution.errorMessage
	});
	await DBAgentMessageUtils.saveAgentMessage({
		chatId: run.chatId,
		role: 'tool',
		textContent: JSON.stringify(resultData),
		toolCallId: body.toolCallId,
		toolName: toolCall.toolName,
		sequenceOrder: 3
	});
	await DBInsightsAgentUtils.touchRun(run.id, { status: 'paused' });

	return json({
		success: true,
		result: resultData,
		displayText: execution.displayText
	});
};
