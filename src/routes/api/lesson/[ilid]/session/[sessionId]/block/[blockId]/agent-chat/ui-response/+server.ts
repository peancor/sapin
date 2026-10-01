import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { DBAgentMessageUtils, DBAgentUIUtils } from '$lib/server/db/agent';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const sessionId = params.sessionId;
	const blockId = params.blockId;
	if (!sessionId || !blockId) {
		return json({ error: 'Missing route params' }, { status: 400 });
	}

	let body: { instanceId: string; componentKey?: string; payload: Record<string, unknown> };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { instanceId, componentKey, payload } = body;
	if (!instanceId || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return json({ error: 'instanceId and payload are required' }, { status: 400 });
	}

	try {
		const runtime = await LessonService.getLessonAgentRuntimeContext({
			sessionId,
			blockId,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid
		});

		const instance = await DBAgentUIUtils.getUIInstance(instanceId);
		if (!instance) {
			return json({ error: 'UI instance not found' }, { status: 404 });
		}

		if (instance.respondedAt) {
			return json({ error: 'UI instance already responded' }, { status: 409 });
		}

		const [message] = await db
			.select({
				id: schema.agentMessage.id,
				chatId: schema.agentMessage.chatId
			})
			.from(schema.agentMessage)
			.where(eq(schema.agentMessage.id, instance.messageId))
			.limit(1);

		if (!message || message.chatId !== runtime.blockVisit.chatId) {
			return json({ error: 'UI instance does not belong to this lesson chat' }, { status: 403 });
		}

		const [uiComponent] = await db
			.select({
				componentKey: schema.agentUIComponent.componentKey
			})
			.from(schema.agentUIComponent)
			.where(eq(schema.agentUIComponent.id, instance.uiComponentId))
			.limit(1);

		if (!uiComponent) {
			return json({ error: 'UI component not found' }, { status: 404 });
		}

		if (componentKey && componentKey !== uiComponent.componentKey) {
			return json({ error: 'componentKey mismatch' }, { status: 400 });
		}

		let resolvedToolCall = null as typeof schema.agentToolCall.$inferSelect | null;

		if (instance.metadata) {
			try {
				const metadata = JSON.parse(instance.metadata) as Record<string, unknown>;
				const metadataToolCallId = metadata.toolCallId;
				if (typeof metadataToolCallId === 'string') {
					const toolCall = await DBAgentMessageUtils.getToolCall(metadataToolCallId);
					if (toolCall && toolCall.messageId === instance.messageId) {
						resolvedToolCall = toolCall;
					}
				}
			} catch {
				// noop
			}
		}

		if (!resolvedToolCall) {
			const toolCalls = await db
				.select()
				.from(schema.agentToolCall)
				.where(eq(schema.agentToolCall.messageId, instance.messageId));

			resolvedToolCall =
				toolCalls.find((toolCall) => toolCall.status === 'awaiting_ui_response') ??
				toolCalls.find((toolCall) => {
					if (!toolCall.result) return false;
					try {
						const result = JSON.parse(toolCall.result) as Record<string, unknown>;
						return result.instanceId === instanceId;
					} catch {
						return false;
					}
				}) ??
				null;
		}

		if (!resolvedToolCall) {
			return json(
				{ error: 'Associated tool call not found for this UI instance' },
				{ status: 409 }
			);
		}

		const score = typeof payload.score === 'number' ? payload.score : undefined;

		await DBAgentUIUtils.updateUIInstance(instanceId, {
			userResponse: JSON.stringify(payload),
			respondedAt: new Date(),
			...(score !== undefined ? { score } : {})
		});

		const renderedResult =
			resolvedToolCall.result ??
			JSON.stringify({
				rendered: true,
				componentKey: uiComponent.componentKey,
				instanceId
			});

		await DBAgentMessageUtils.updateToolCall(resolvedToolCall.id, {
			status: 'completed',
			result: renderedResult,
			errorMessage: null
		});

		await DBAgentMessageUtils.saveAgentMessage({
			chatId: runtime.blockVisit.chatId!,
			role: 'tool',
			textContent: JSON.stringify(payload),
			toolCallId: resolvedToolCall.id,
			toolName: resolvedToolCall.toolName,
			sequenceOrder: 3
		});

		await LessonService.syncLessonAgentBlockOutputs({
			sessionId,
			blockId,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid
		});

		return json({ success: true, resumeSuggested: true });
	} catch (error) {
		if (error instanceof LessonServiceError) {
			return json({ error: error.message }, { status: error.status });
		}

		console.error('[lesson-agent] ui-response error', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
