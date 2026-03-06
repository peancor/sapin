import { stepCountIs, ToolLoopAgent, type ModelMessage } from 'ai';
import { DBAgentMessageUtils } from '$lib/server/db/agent';
import { ModelResolver } from '$lib/server/ai/services/ModelResolver';
import { UsageTracker } from '$lib/server/ai/services/UsageTracker';
import { ToolExecutor } from '$lib/server/agent/ToolExecutor';
import { ToolManager } from '$lib/server/agent/ToolManager';
import {
	AgentStreamProcessor,
	type HitlSentinel,
	type StreamAccumulator
} from '$lib/server/agent/AgentStreamProcessor';
import type { AgentContext, AgentStreamPart, ToolDefinitionResolved } from '$lib/types/agent';
import { DBInsightsAgentUtils } from '$lib/server/db/insights-agent';
import type { InsightsAgentRunScope } from '$lib/types/insightsAgent';

export class InsightsAgentEngine {
	private static buildMessagesFromHistory(context: AgentContext, userMessage: string): ModelMessage[] {
		return [
			...context.messageHistory.map((message): ModelMessage => {
				if (message.role === 'tool') {
					return {
						role: 'tool',
						content: [
							{
								type: 'tool-result',
								toolCallId: message.toolCallId ?? '',
								toolName: message.toolName ?? '',
								output: { type: 'text', value: message.content ?? '' }
							}
						]
					};
				}

				return {
					role: message.role,
					content: message.content
				} as ModelMessage;
			}),
			{ role: 'user', content: userMessage }
		];
	}

	private static buildTools(
		context: AgentContext,
		runtimeTools: ToolDefinitionResolved[],
		scope: InsightsAgentRunScope
	): Record<string, ReturnType<typeof ToolManager.buildVercelAITools>[string]> {
		const withScopeDefaults = (
			toolName: string,
			input: Record<string, unknown>
		): Record<string, unknown> => {
			const scopedInput = { ...input };

			if (toolName === 'get_activity_evidence_overview') {
				if (scope.mode === 'students' && scopedInput.studentIds === undefined) {
					scopedInput.studentIds = scope.studentIds;
				}
				return scopedInput;
			}

			if (toolName === 'get_activity_transcripts') {
				if (scope.mode === 'students' && scopedInput.studentIds === undefined) {
					scopedInput.studentIds = scope.studentIds;
				}
				if (scope.mode === 'sessions' && scopedInput.chatIds === undefined && scope.chatIds.length > 0) {
					scopedInput.chatIds = scope.chatIds;
				}
				if (scopedInput.dateFrom === undefined && scope.dateFrom) {
					scopedInput.dateFrom = scope.dateFrom;
				}
				if (scopedInput.dateTo === undefined && scope.dateTo) {
					scopedInput.dateTo = scope.dateTo;
				}
				if (scopedInput.search === undefined && scope.search) {
					scopedInput.search = scope.search;
				}
			}

			return scopedInput;
		};

		return ToolManager.buildVercelAITools(runtimeTools, async (toolName, input, toolCallId) => {
			const toolDef = runtimeTools.find((tool) => tool.name === toolName);
			const scopedInput = withScopeDefaults(toolName, input);
			if (JSON.stringify(scopedInput) !== JSON.stringify(input)) {
				await DBAgentMessageUtils.updateToolCall(toolCallId, {
					arguments: JSON.stringify(scopedInput)
				});
			}
			if (toolDef?.requiresConfirmation) {
				await DBAgentMessageUtils.updateToolCall(toolCallId, { status: 'awaiting_confirmation' });
				return {
					__hitl: true,
					toolCallId,
					toolName,
					toolDisplayName: toolDef.displayName,
					riskLevel: toolDef.riskLevel,
					args: scopedInput
				} satisfies HitlSentinel;
			}

			const result = await ToolExecutor.execute(toolName, scopedInput, context);
			return result.success ? result.data : { error: result.errorMessage };
		});
	}

	private static async finalizeRunSuccess(params: {
		runId: string;
		result: Awaited<ReturnType<ToolLoopAgent['stream']>>;
		modelName: string;
		context: AgentContext;
		usageMetadata: Record<string, unknown>;
		startTime: number;
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
			metadata: params.usageMetadata
		});
		await DBInsightsAgentUtils.touchRun(params.runId, { status: 'completed' });
	}

	static async *executeLoop(params: {
		runId: string;
		context: AgentContext;
		systemPrompt: string;
		userMessage: string;
		scope: InsightsAgentRunScope;
	}): AsyncGenerator<AgentStreamPart> {
		const { context, systemPrompt, userMessage, runId, scope } = params;
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
		} catch {
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
			tools: this.buildTools(context, runtimeTools, scope),
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
		await DBInsightsAgentUtils.touchRun(runId, { status: 'running' });

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
			finalizationPayload: null
		};

		try {
			yield { type: 'status', status: 'thinking' };

			const result = await agent.stream({
				messages: this.buildMessagesFromHistory(context, userMessage)
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
				await this.finalizeRunSuccess({
					runId,
					result,
					modelName,
					context,
					usageMetadata: {
						toolCallsCount: accumulated.toolCallsCount,
						insightsAgent: true
					},
					startTime
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
				await DBInsightsAgentUtils.touchRun(runId, { status: 'paused' });
			}
		} catch (error) {
			await DBInsightsAgentUtils.touchRun(runId, { status: 'failed' });
			yield {
				type: 'error',
				code: 'ENGINE_ERROR',
				message: error instanceof Error ? error.message : 'Error inesperado en el agente de insights'
			};
		}
	}

	static async *resumeFromToolCall(params: {
		runId: string;
		context: AgentContext;
		systemPrompt: string;
		scope: InsightsAgentRunScope;
	}): AsyncGenerator<AgentStreamPart> {
		const { context, systemPrompt, runId, scope } = params;
		const startTime = Date.now();
		const modelName = context.activityConfig.llmModel || (await ModelResolver.getDefaultModel()) || '';

		if (!modelName) {
			yield { type: 'error', code: 'NO_MODEL', message: 'No hay modelo configurado.' };
			return;
		}

		let model;
		try {
			model = await ModelResolver.buildChatModel(modelName);
		} catch {
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
				message: 'No se pudo reconstruir el historial del run.'
			};
			return;
		}

		const runtimeTools = context.enabledTools;
		const agent = new ToolLoopAgent({
			model,
			instructions: systemPrompt,
			tools: this.buildTools(context, runtimeTools, scope),
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
			finalizationPayload: null
		};

		try {
			yield { type: 'status', status: 'thinking' };
			await DBInsightsAgentUtils.touchRun(runId, { status: 'running' });

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
				await this.finalizeRunSuccess({
					runId,
					result,
					modelName,
					context,
					usageMetadata: {
						toolCallsCount: accumulated.toolCallsCount,
						insightsAgent: true,
						resumed: true
					},
					startTime
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
				await DBInsightsAgentUtils.touchRun(runId, { status: 'paused' });
			}
		} catch (error) {
			await DBInsightsAgentUtils.touchRun(runId, { status: 'failed' });
			yield {
				type: 'error',
				code: 'ENGINE_ERROR',
				message: error instanceof Error ? error.message : 'Error al reanudar el agente de insights'
			};
		}
	}
}
