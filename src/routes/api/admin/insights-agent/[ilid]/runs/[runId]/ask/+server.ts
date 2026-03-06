import type { RequestHandler } from './$types';
import { CourseInteractiveAuthUtils } from '$lib/server/db';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { DBAgentMessageUtils } from '$lib/server/db/agent';
import { DBInsightsAgentUtils } from '$lib/server/db/insights-agent';
import { LearningEvidenceService } from '$lib/server/learning-evidence';
import { InsightsAgentEngine, InsightsAgentPromptBuilder } from '$lib/server/insights-agent';
import type { AgentContext } from '$lib/types/agent';

function sseError(message: string): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(
				encoder.encode(
					`data: ${JSON.stringify({ type: 'error', code: 'REQUEST_ERROR', message })}\n\n`
				)
			);
			controller.enqueue(encoder.encode('data: [DONE]\n\n'));
			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache'
		}
	});
}

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const user = locals.user;
	if (!user) return sseError('Unauthorized');

	const { ilid, runId } = params;
	const userMessage = url.searchParams.get('message');
	const isResume = url.searchParams.get('resume') === 'true';

	if (!isResume && !userMessage) {
		return sseError('Missing required parameters');
	}

	const [courseRelation] = await db
		.select({ courseId: schema.courseInteractiveLearning.courseId })
		.from(schema.courseInteractiveLearning)
		.where(eq(schema.courseInteractiveLearning.interactiveLearningId, ilid))
		.limit(1);

	if (!courseRelation?.courseId) return sseError('Actividad no asociada a un curso');

	const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
		user.id,
		courseRelation.courseId,
		ilid,
		user.highestRoleLevel
	);
	if (!access.allowed) {
		return sseError(access.reason || 'Sin permisos');
	}

	const run = await DBInsightsAgentUtils.getRunForActivity(runId, ilid);
	if (!run) return sseError('Run no encontrado');
	if (run.createdByUserId !== user.id) {
		return sseError('Solo el creador del run puede continuarlo');
	}

	const configRecord = await DBInsightsAgentUtils.getOrCreateConfig(ilid);
	const enabledTools = await DBInsightsAgentUtils.getEnabledToolsForActivity(ilid);
	let parsedScope: Record<string, unknown> | null = null;
	try {
		parsedScope = run.scope ? (JSON.parse(run.scope) as Record<string, unknown>) : null;
	} catch {
		parsedScope = null;
	}
	const scope = DBInsightsAgentUtils.normalizeScope(parsedScope);

	const overview = await LearningEvidenceService.getActivityEvidenceOverview(
		{ actorUserId: user.id, actorHighestRoleLevel: user.highestRoleLevel },
		ilid,
		scope.mode === 'students' ? scope.studentIds : undefined
	);

	const systemPrompt = InsightsAgentPromptBuilder.build({
		role: configRecord.llmRole,
		instructions: configRecord.llmInstructions,
		context: configRecord.llmContext,
		systemPrompt: configRecord.systemPrompt,
		overview,
		scope,
		tools: enabledTools
	});

	const messageHistory = isResume ? [] : await DBAgentMessageUtils.getAgentMessages(run.chatId);
	const context: AgentContext = {
		userId: user.id,
		courseId: courseRelation.courseId,
		chatId: run.chatId,
		activityId: ilid,
		activityConfig: {
			llmModel: configRecord.llmModel,
			llmRole: configRecord.llmRole,
			llmInstructions: configRecord.llmInstructions,
			llmContext: configRecord.llmContext,
			systemPrompt: configRecord.systemPrompt,
			temperature: configRecord.temperature,
			maxTokens: configRecord.maxTokens,
			topP: configRecord.topP,
			maxToolRoundtrips: configRecord.maxToolRoundtrips,
			parallelToolCalls: configRecord.parallelToolCalls,
			toolChoice: configRecord.toolChoice as 'auto' | 'required' | 'none',
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
		messageHistory
	};

	if (!isResume && !run.title && userMessage) {
		await DBInsightsAgentUtils.updateRun(run.id, {
			title: userMessage.trim().slice(0, 80)
		});
	}

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			try {
				const generator = isResume
					? InsightsAgentEngine.resumeFromToolCall({
							runId: run.id,
							context,
							systemPrompt,
							scope
						})
					: InsightsAgentEngine.executeLoop({
							runId: run.id,
							context,
							systemPrompt,
							userMessage: userMessage ?? '',
							scope
						});

				for await (const part of generator) {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`));
				}
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
			} catch (error) {
				controller.enqueue(
					encoder.encode(
						`data: ${JSON.stringify({
							type: 'error',
							code: 'INTERNAL_ERROR',
							message:
								error instanceof Error ? error.message : 'Error interno del servidor'
						})}\n\n`
					)
				);
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
