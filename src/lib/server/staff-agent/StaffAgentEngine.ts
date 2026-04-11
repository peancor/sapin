import { stepCountIs, ToolLoopAgent, type ModelMessage } from 'ai';
import { ModelResolver } from '$lib/server/ai/services/ModelResolver';
import { UsageTracker } from '$lib/server/ai/services/UsageTracker';
import {
	AgentStreamProcessor,
	type HitlSentinel,
	type StreamAccumulator
} from '$lib/server/agent/AgentStreamProcessor';
import { ToolExecutor } from '$lib/server/agent/ToolExecutor';
import { ToolManager } from '$lib/server/agent/ToolManager';
import { DBAgentMessageUtils } from '$lib/server/db/agent';
import { DBStaffAgentUtils } from '$lib/server/db/staff-agent';
import type { AgentContext, AgentStreamPart, ToolDefinitionResolved } from '$lib/types/agent';

export class StaffAgentEngine {
	private static async logFailureUsage(params: {
		modelName: string;
		context: AgentContext;
		startTime: number;
		errorMessage: string;
		metadata?: Record<string, unknown>;
	}) {
		try {
			await UsageTracker.logUsage({
				modelName: params.modelName,
				userId: params.context.userId,
				courseId: params.context.courseId,
				interactiveLearningId: params.context.activityId,
				chatId: params.context.chatId,
				operation: 'chat',
				inputTokens: 0,
				outputTokens: 0,
				durationMs: Date.now() - params.startTime,
				success: false,
				errorMessage: params.errorMessage,
				metadata: {
					staffAgent: true,
					...params.metadata
				}
			});
		} catch {
			// Best effort.
		}
	}

	private static async buildMessagesFromDB(chatId: string): Promise<ModelMessage[]> {
		return DBAgentMessageUtils.getAgentMessagesAsModelMessages(chatId);
	}

	private static buildTools(
		context: AgentContext,
		runtimeTools: ToolDefinitionResolved[]
	): Record<string, ReturnType<typeof ToolManager.buildVercelAITools>[string]> {
		return ToolManager.buildVercelAITools(runtimeTools, async (toolName, input, toolCallId) => {
			const toolDef = runtimeTools.find((tool) => tool.name === toolName);
			if (toolDef?.requiresConfirmation) {
				await DBAgentMessageUtils.updateToolCall(toolCallId, { status: 'awaiting_confirmation' });
				return {
					__hitl: true,
					toolCallId,
					toolName,
					toolDisplayName: toolDef.displayName,
					riskLevel: toolDef.riskLevel,
					args: input
				} satisfies HitlSentinel;
			}

			const result = await ToolExecutor.execute(toolName, input, context);
			return result.success ? result.data : { error: result.errorMessage };
		});
	}

	private static async finalizeSuccess(params: {
		threadId: string;
		result: Awaited<ReturnType<ToolLoopAgent['stream']>>;
		modelName: string;
		context: AgentContext;
		startTime: number;
		metadata?: Record<string, unknown>;
	}) {
		const usage = await params.result.usage;
		await UsageTracker.logUsage({
			modelName: params.modelName,
			userId: params.context.userId,
			courseId: params.context.courseId,
			interactiveLearningId: params.context.activityId,
			chatId: params.context.chatId,
			operation: 'chat',
			inputTokens: usage?.inputTokens ?? 0,
			outputTokens: usage?.outputTokens ?? 0,
			durationMs: Date.now() - params.startTime,
			success: true,
			metadata: {
				staffAgent: true,
				...params.metadata
			}
		});
		await DBStaffAgentUtils.touchThread(params.threadId, {
			status: 'active'
		});
	}

	static async *executeLoop(params: {
		threadId: string;
		context: AgentContext;
		systemPrompt: string;
		userMessage: string;
	}): AsyncGenerator<AgentStreamPart> {
		const { context, systemPrompt, userMessage, threadId } = params;
		const startTime = Date.now();
		const modelName = context.activityConfig.llmModel || (await ModelResolver.getDefaultModel()) || '';

		if (!modelName) {
			yield { type: 'error', code: 'NO_MODEL', message: 'No hay modelo configurado.' };
			return;
		}

		const quotaCheck = await UsageTracker.checkQuota(
			modelName,
			context.userId,
			context.courseId,
			context.activityId
		);
		if (!quotaCheck.allowed) {
			await this.logFailureUsage({
				modelName,
				context,
				startTime,
				errorMessage: quotaCheck.reason ?? 'Cuota de uso alcanzada.',
				metadata: { phase: 'quota_check' }
			});
			yield {
				type: 'error',
				code: 'QUOTA_EXCEEDED',
				message: quotaCheck.reason ?? 'Cuota de uso alcanzada.'
			};
			return;
		}

		let model;
		try {
			model = await ModelResolver.buildChatModel(modelName);
		} catch (error) {
			await this.logFailureUsage({
				modelName,
				context,
				startTime,
				errorMessage:
					error instanceof Error ? error.message : `No se pudo cargar el modelo "${modelName}".`,
				metadata: { phase: 'model_build' }
			});
			yield {
				type: 'error',
				code: 'MODEL_ERROR',
				message: `No se pudo cargar el modelo "${modelName}".`
			};
			return;
		}

		const runtimeTools = context.enabledTools;
		const agent = new ToolLoopAgent({
			model,
			instructions: systemPrompt,
			tools: this.buildTools(context, runtimeTools),
			toolChoice: runtimeTools.length > 0 ? context.activityConfig.toolChoice : undefined,
			stopWhen: stepCountIs(context.activityConfig.maxToolRoundtrips),
			temperature: context.activityConfig.temperature ?? 0.2,
			maxOutputTokens: context.activityConfig.maxTokens ?? 2200
		});

		await DBAgentMessageUtils.saveAgentMessage({
			chatId: context.chatId,
			role: 'user',
			textContent: userMessage,
			sequenceOrder: 0
		});
		await DBStaffAgentUtils.touchThread(threadId, { status: 'active' });

		const assistantMsgId = await DBAgentMessageUtils.saveAgentMessage({
			chatId: context.chatId,
			role: 'assistant',
			textContent: '',
			sequenceOrder: 1
		});

		const accumulated: StreamAccumulator = {
			text: '',
			toolCallsCount: 0,
			hitlTriggered: false,
			uiWaitTriggered: false,
			finalizationTriggered: false,
			finalizationPayload: null,
			streamError: null
		};

		try {
			yield { type: 'status', status: 'thinking' };

			const result = await agent.stream({
				messages: await this.buildMessagesFromDB(context.chatId)
			});

			for await (const part of AgentStreamProcessor.process(
				result,
				context,
				runtimeTools,
				assistantMsgId,
				accumulated
			)) {
				yield part;
			}

			if (!accumulated.hitlTriggered && !accumulated.uiWaitTriggered) {
				await DBAgentMessageUtils.updateAgentMessage(assistantMsgId, {
					textContent: accumulated.text,
					finishReason: 'stop'
				});
				await this.finalizeSuccess({
					threadId,
					result,
					modelName,
					context,
					startTime,
					metadata: {
						toolCallsCount: accumulated.toolCallsCount,
						streamError: accumulated.streamError ?? undefined
					}
				});

				const usage = await result.usage;
				yield {
					type: 'done',
					usage: {
						inputTokens: usage?.inputTokens ?? 0,
						outputTokens: usage?.outputTokens ?? 0,
						totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
						toolCallsCount: accumulated.toolCallsCount
					},
					finishReason: (await result.finishReason) ?? 'stop'
				};
			} else if (accumulated.hitlTriggered) {
				await DBAgentMessageUtils.updateAgentMessage(assistantMsgId, {
					textContent: accumulated.text,
					finishReason: 'hitl'
				});
				await DBStaffAgentUtils.touchThread(threadId, { status: 'paused' });
			}
		} catch (error) {
			await this.logFailureUsage({
				modelName,
				context,
				startTime,
				errorMessage:
					error instanceof Error ? error.message : 'Error inesperado en el staff-agent',
				metadata: { phase: 'execute_loop', toolCallsCount: accumulated.toolCallsCount }
			});
			await DBStaffAgentUtils.touchThread(threadId, { status: 'paused' });
			yield {
				type: 'error',
				code: 'ENGINE_ERROR',
				message: error instanceof Error ? error.message : 'Error inesperado en el staff-agent'
			};
		}
	}

	static async *resumeFromToolCall(params: {
		threadId: string;
		context: AgentContext;
		systemPrompt: string;
	}): AsyncGenerator<AgentStreamPart> {
		const { context, systemPrompt, threadId } = params;
		const startTime = Date.now();
		const modelName = context.activityConfig.llmModel || (await ModelResolver.getDefaultModel()) || '';

		if (!modelName) {
			yield { type: 'error', code: 'NO_MODEL', message: 'No hay modelo configurado.' };
			return;
		}

		let model;
		try {
			model = await ModelResolver.buildChatModel(modelName);
		} catch (error) {
			await this.logFailureUsage({
				modelName,
				context,
				startTime,
				errorMessage:
					error instanceof Error ? error.message : `No se pudo cargar el modelo "${modelName}".`,
				metadata: { phase: 'resume_model_build', resumed: true }
			});
			yield {
				type: 'error',
				code: 'MODEL_ERROR',
				message: `No se pudo cargar el modelo "${modelName}".`
			};
			return;
		}

		const messages = await DBAgentMessageUtils.getAgentMessagesAsModelMessages(context.chatId);
		if (messages.length === 0) {
			yield {
				type: 'error',
				code: 'RESUME_ERROR',
				message: 'No se pudo reconstruir el historial del hilo.'
			};
			return;
		}

		const runtimeTools = context.enabledTools;
		const agent = new ToolLoopAgent({
			model,
			instructions: systemPrompt,
			tools: this.buildTools(context, runtimeTools),
			toolChoice: runtimeTools.length > 0 ? context.activityConfig.toolChoice : undefined,
			stopWhen: stepCountIs(context.activityConfig.maxToolRoundtrips),
			temperature: context.activityConfig.temperature ?? 0.2,
			maxOutputTokens: context.activityConfig.maxTokens ?? 2200
		});

		const assistantMsgId = await DBAgentMessageUtils.saveAgentMessage({
			chatId: context.chatId,
			role: 'assistant',
			textContent: '',
			sequenceOrder: 99
		});

		const accumulated: StreamAccumulator = {
			text: '',
			toolCallsCount: 0,
			hitlTriggered: false,
			uiWaitTriggered: false,
			finalizationTriggered: false,
			finalizationPayload: null,
			streamError: null
		};

		try {
			yield { type: 'status', status: 'thinking' };
			await DBStaffAgentUtils.touchThread(threadId, { status: 'active' });

			const result = await agent.stream({ messages });
			for await (const part of AgentStreamProcessor.process(
				result,
				context,
				runtimeTools,
				assistantMsgId,
				accumulated
			)) {
				yield part;
			}

			if (!accumulated.hitlTriggered && !accumulated.uiWaitTriggered) {
				await DBAgentMessageUtils.updateAgentMessage(assistantMsgId, {
					textContent: accumulated.text,
					finishReason: 'stop'
				});
				await this.finalizeSuccess({
					threadId,
					result,
					modelName,
					context,
					startTime,
					metadata: {
						resumed: true,
						toolCallsCount: accumulated.toolCallsCount,
						streamError: accumulated.streamError ?? undefined
					}
				});

				const usage = await result.usage;
				yield {
					type: 'done',
					usage: {
						inputTokens: usage?.inputTokens ?? 0,
						outputTokens: usage?.outputTokens ?? 0,
						totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
						toolCallsCount: accumulated.toolCallsCount
					},
					finishReason: (await result.finishReason) ?? 'stop'
				};
			} else if (accumulated.hitlTriggered) {
				await DBAgentMessageUtils.updateAgentMessage(assistantMsgId, {
					textContent: accumulated.text,
					finishReason: 'hitl'
				});
				await DBStaffAgentUtils.touchThread(threadId, { status: 'paused' });
			}
		} catch (error) {
			await this.logFailureUsage({
				modelName,
				context,
				startTime,
				errorMessage:
					error instanceof Error ? error.message : 'Error al reanudar el staff-agent',
				metadata: {
					phase: 'resume_loop',
					resumed: true,
					toolCallsCount: accumulated.toolCallsCount
				}
			});
			await DBStaffAgentUtils.touchThread(threadId, { status: 'paused' });
			yield {
				type: 'error',
				code: 'ENGINE_ERROR',
				message: error instanceof Error ? error.message : 'Error al reanudar el staff-agent'
			};
		}
	}
}

export default StaffAgentEngine;
