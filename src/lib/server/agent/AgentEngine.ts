import { streamText, stepCountIs, type ModelMessage } from 'ai';
import type { AgentContext, AgentStreamPart, ToolDefinitionResolved } from '$lib/types/agent';
import { ModelResolver } from '$lib/server/ai/services/ModelResolver';
import { UsageTracker } from '$lib/server/ai/services/UsageTracker';
import { RagService } from '$lib/server/ai/services/RagService';
import { DBAgentMessageUtils } from '$lib/server/db/agent';
import { ToolManager } from './ToolManager';
import { ToolExecutor } from './ToolExecutor';
import { AgentPromptBuilder } from './AgentPromptBuilder';
import { AgentFinalizationService } from './AgentFinalizationService';
import { AgentUIRendererService } from './AgentUIRendererService';
import {
	AgentStreamProcessor,
	type FinalizeSentinel,
	type HitlSentinel,
	type StreamAccumulator
} from './AgentStreamProcessor';

export class AgentEngine {
	private static readonly DEFAULT_FINALIZATION_TOOL_NAME = 'finalize_activity';

	private static getFinalizationToolName(context: AgentContext): string {
		return (
			context.activityConfig.finalizationToolName?.trim() || this.DEFAULT_FINALIZATION_TOOL_NAME
		);
	}

	private static buildMessagesFromHistory(
		context: AgentContext,
		userMessage: string
	): ModelMessage[] {
		return [
			...context.messageHistory.map((m): ModelMessage => {
				if (m.role === 'tool') {
					return {
						role: 'tool',
						content: [
							{
								type: 'tool-result',
								toolCallId: m.toolCallId ?? '',
								toolName: m.toolName ?? '',
								output: { type: 'text', value: m.content ?? '' }
							}
						]
					};
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				return { role: m.role, content: m.content } as any as ModelMessage;
			}),
			{ role: 'user', content: userMessage }
		];
	}

	private static getRuntimeTools(context: AgentContext): ToolDefinitionResolved[] {
		const finalizationToolName = this.getFinalizationToolName(context);
		const baseTools = context.enabledTools.filter((tool) => tool.name !== finalizationToolName);

		if (!context.activityConfig.finalizationEnabled) {
			return baseTools;
		}

		const finalizationTool: ToolDefinitionResolved = {
			id: '__finalization_virtual_tool__',
			name: finalizationToolName,
			displayName: 'Finalizar actividad',
			description:
				'Usa esta herramienta cuando el objetivo de la actividad se haya completado para cerrar la sesion.',
			category: 'evaluation',
			parametersSchema: {
				type: 'object',
				properties: {
					summary: {
						type: 'string',
						description: 'Resumen final de lo trabajado y logrado por el estudiante.'
					},
					result: {
						type: 'string',
						enum: ['completed', 'passed', 'failed'],
						description: 'Resultado final opcional de la actividad.'
					},
					score: {
						type: 'number',
						minimum: 0,
						maximum: 1,
						description: 'Puntaje opcional normalizado entre 0 y 1.'
					},
					feedback: {
						type: 'string',
						description: 'Feedback final opcional para el estudiante.'
					}
				},
				required: ['summary']
			},
			responseSchema: undefined,
			executorType: 'builtin',
			executorConfig: { handler: '__finalize_activity__' },
			requiresConfirmation: false,
			riskLevel: 'low',
			configOverride: undefined
		};

		return [...baseTools, finalizationTool];
	}

	private static resolveToolChoice(
		context: AgentContext,
		runtimeTools: ToolDefinitionResolved[]
	): 'auto' | 'required' | 'none' {
		if (runtimeTools.length === 0) return 'none';

		const configured = context.activityConfig.toolChoice ?? 'auto';
		const finalizationRequired =
			context.activityConfig.finalizationEnabled &&
			context.activityConfig.requireFinalizationToolCall;

		if (finalizationRequired && configured === 'none') {
			return 'auto';
		}

		return configured;
	}

	private static buildTools(
		context: AgentContext,
		assistantMsgId: string,
		runtimeTools: ToolDefinitionResolved[]
	) {
		const finalizationToolName = this.getFinalizationToolName(context);

		return ToolManager.buildVercelAITools(runtimeTools, async (toolName, input, toolCallId) => {
			if (context.activityConfig.finalizationEnabled && toolName === finalizationToolName) {
				return {
					__finalize: true,
					summary:
						typeof input.summary === 'string'
							? input.summary
							: 'Actividad finalizada por el agente.',
					result:
						input.result === 'completed' || input.result === 'passed' || input.result === 'failed'
							? input.result
							: undefined,
					score: typeof input.score === 'number' ? input.score : undefined,
					feedback: typeof input.feedback === 'string' ? input.feedback : undefined
				} satisfies FinalizeSentinel;
			}

			const toolDef = runtimeTools.find((t) => t.name === toolName);

			if (
				toolDef?.executorType === 'builtin' &&
				toolDef?.executorConfig?.handler === 'ui_renderer'
			) {
				if (!toolDef) {
					return { error: `Tool "${toolName}" is not available.` };
				}

				const rendered = await AgentUIRendererService.renderUIComponent({
					context,
					runtimeTool: toolDef,
					input,
					assistantMsgId,
					toolName,
					toolCallId
				});

				if (!rendered.ok) {
					return { error: rendered.error };
				}

				return rendered.sentinel;
			}

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

	static async *executeLoop(
		context: AgentContext,
		userMessage: string
	): AsyncGenerator<AgentStreamPart> {
		const startTime = Date.now();
		const config = context.activityConfig;
		const modelName = config.llmModel || (await ModelResolver.getDefaultModel()) || '';

		if (!modelName) {
			yield {
				type: 'error',
				code: 'NO_MODEL',
				message: 'No hay modelo de IA configurado para esta actividad.'
			};
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

		let ragContext: string | null = null;
		if (config.ragEnabled && config.ragCollectionName) {
			try {
				const ragResult = await RagService.getRagContext(
					userMessage,
					config.ragCollectionName,
					5,
					0.7
				);
				ragContext = ragResult?.context ?? null;
			} catch {
				// Continue without RAG context.
			}
		}

		const runtimeTools = this.getRuntimeTools(context);
		const systemPrompt = AgentPromptBuilder.buildSystemPrompt(config, runtimeTools, ragContext);

		await DBAgentMessageUtils.saveAgentMessage({
			chatId: context.chatId,
			role: 'user',
			textContent: userMessage,
			sequenceOrder: 0
		});

		yield { type: 'status', status: 'thinking' };

		const messages = this.buildMessagesFromHistory(context, userMessage);

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
			const tools = this.buildTools(context, assistantMsgId, runtimeTools);
			const useTools = Object.keys(tools).length > 0 ? tools : undefined;
			const toolChoice = useTools ? this.resolveToolChoice(context, runtimeTools) : undefined;

			const result = streamText({
				model,
				system: systemPrompt,
				messages,
				tools: useTools,
				toolChoice,
				stopWhen: stepCountIs(config.maxToolRoundtrips),
				temperature: config.temperature ?? 0.7,
				maxOutputTokens: config.maxTokens ?? 2000,
				onFinish: async (finishResult) => {
					const durationMs = Date.now() - startTime;
					try {
						await UsageTracker.logUsage({
							modelName,
							userId: context.userId,
							courseId: context.courseId,
							interactiveLearningId: context.activityId,
							chatId: context.chatId,
							operation: 'chat',
							inputTokens: finishResult.usage?.inputTokens ?? 0,
							outputTokens: finishResult.usage?.outputTokens ?? 0,
							durationMs,
							success: true,
							metadata: {
								toolCallsCount: accumulated.toolCallsCount,
								ragEnabled: config.ragEnabled,
								agentMode: true
							}
						});
					} catch {
						// Usage log failures must not interrupt the stream.
					}
				}
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
					finishReason: accumulated.finalizationTriggered ? 'finalized' : 'stop'
				});

				if (accumulated.finalizationTriggered && accumulated.finalizationPayload) {
					try {
						await AgentFinalizationService.runFinalizationHook({
							context,
							payload: accumulated.finalizationPayload,
							assistantMessageId: assistantMsgId
						});
					} catch (error) {
						console.error('[AgentEngine] finalization hook failed:', error);
					}
				}

				const finalUsage = await result.usage;
				yield {
					type: 'done',
					usage: {
						inputTokens: finalUsage?.inputTokens ?? 0,
						outputTokens: finalUsage?.outputTokens ?? 0,
						totalTokens: (finalUsage?.inputTokens ?? 0) + (finalUsage?.outputTokens ?? 0),
						toolCallsCount: accumulated.toolCallsCount
					},
					finishReason: accumulated.finalizationTriggered
						? 'finalized'
						: ((await result.finishReason) ?? 'stop')
				};
			}
		} catch (error) {
			yield {
				type: 'error',
				code: 'ENGINE_ERROR',
				message: error instanceof Error ? error.message : 'Error inesperado en el motor agentico'
			};
		}
	}

	static async *resumeFromToolCall(context: AgentContext): AsyncGenerator<AgentStreamPart> {
		const startTime = Date.now();
		const config = context.activityConfig;
		const modelName = config.llmModel || (await ModelResolver.getDefaultModel()) || '';

		if (!modelName) {
			yield { type: 'error', code: 'NO_MODEL', message: 'No hay modelo de IA configurado.' };
			return;
		}

		const messages = await DBAgentMessageUtils.getAgentMessagesAsModelMessages(context.chatId);
		if (messages.length === 0) {
			yield {
				type: 'error',
				code: 'RESUME_ERROR',
				message: 'No se pudo reconstruir el historial.'
			};
			return;
		}

		const runtimeTools = this.getRuntimeTools(context);
		const systemPrompt = AgentPromptBuilder.buildSystemPrompt(config, runtimeTools, null);

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

		yield { type: 'status', status: 'thinking' };

		try {
			const tools = this.buildTools(context, assistantMsgId, runtimeTools);
			const useTools = Object.keys(tools).length > 0 ? tools : undefined;
			const toolChoice = useTools ? this.resolveToolChoice(context, runtimeTools) : undefined;

			const result = streamText({
				model,
				system: systemPrompt,
				messages,
				tools: useTools,
				toolChoice,
				stopWhen: stepCountIs(config.maxToolRoundtrips),
				temperature: config.temperature ?? 0.7,
				maxOutputTokens: config.maxTokens ?? 2000,
				onFinish: async (finishResult) => {
					const durationMs = Date.now() - startTime;
					try {
						await UsageTracker.logUsage({
							modelName,
							userId: context.userId,
							courseId: context.courseId,
							interactiveLearningId: context.activityId,
							chatId: context.chatId,
							operation: 'chat',
							inputTokens: finishResult.usage?.inputTokens ?? 0,
							outputTokens: finishResult.usage?.outputTokens ?? 0,
							durationMs,
							success: true,
							metadata: {
								toolCallsCount: accumulated.toolCallsCount,
								agentMode: true,
								resumed: true
							}
						});
					} catch {
						// Usage log failures must not interrupt the stream.
					}
				}
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
					finishReason: accumulated.finalizationTriggered ? 'finalized' : 'stop'
				});

				if (accumulated.finalizationTriggered && accumulated.finalizationPayload) {
					try {
						await AgentFinalizationService.runFinalizationHook({
							context,
							payload: accumulated.finalizationPayload,
							assistantMessageId: assistantMsgId
						});
					} catch (error) {
						console.error('[AgentEngine] finalization hook failed on resume:', error);
					}
				}

				const finalUsage = await result.usage;
				yield {
					type: 'done',
					usage: {
						inputTokens: finalUsage?.inputTokens ?? 0,
						outputTokens: finalUsage?.outputTokens ?? 0,
						totalTokens: (finalUsage?.inputTokens ?? 0) + (finalUsage?.outputTokens ?? 0),
						toolCallsCount: accumulated.toolCallsCount
					},
					finishReason: accumulated.finalizationTriggered
						? 'finalized'
						: ((await result.finishReason) ?? 'stop')
				};
			}
		} catch (error) {
			yield {
				type: 'error',
				code: 'ENGINE_ERROR',
				message: error instanceof Error ? error.message : 'Error en la continuacion del agente'
			};
		}
	}
}
