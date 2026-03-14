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
import { AgentMemoryService } from './memory';
import { AIRequestCaptureService } from '$lib/server/ai/AIRequestCaptureService';
import {
	AgentStreamProcessor,
	type FinalizeSentinel,
	type HitlSentinel,
	type StreamAccumulator
} from './AgentStreamProcessor';

export class AgentEngine {
	private static readonly DEFAULT_FINALIZATION_TOOL_NAME = 'finalize_activity';

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
					agentMode: true,
					...params.metadata
				}
			});
		} catch {
			// Usage log failures must not block the agent.
		}
	}

	private static getFinalizationToolName(context: AgentContext): string {
		return (
			context.activityConfig.finalizationToolName?.trim() || this.DEFAULT_FINALIZATION_TOOL_NAME
		);
	}

	/**
	 * Builds the full message history from DB, including tool-call parts on assistant messages.
	 * The user message must already be saved to DB before calling this method.
	 */
	private static async buildMessagesFromDB(chatId: string): Promise<ModelMessage[]> {
		return DBAgentMessageUtils.getAgentMessagesAsModelMessages(chatId);
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
				[
					'Usa esta herramienta cuando el objetivo de la actividad se haya completado para cerrar la sesion.',
					AgentMemoryService.getFinalizationInstruction(context)
				]
					.filter(Boolean)
					.join(' '),
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
				const blocker = await AgentMemoryService.getFinalizationBlocker(context);
				if (blocker) {
					return {
						finalizationBlocked: true,
						reason:
							'Antes de finalizar debes sincronizar la memoria pendiente de esta sesión.',
						dirtyScopes: blocker.dirtyScopes,
						nextStep:
							'Llama primero a las herramientas de actualización de memoria indicadas y, cuando terminen con éxito o unchanged, vuelve a finalizar.'
					};
				}

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

			const result = await ToolExecutor.execute(toolName, input, context, toolCallId);
			return result.success ? result.data : { error: result.errorMessage };
		});
	}

	private static async startCaptureRound(params: {
		context: AgentContext;
		modelName: string;
		roundType: 'agent' | 'agent_resume';
		startTime: number;
		systemPrompt: string;
		messages: ModelMessage[];
		runtimeTools: ToolDefinitionResolved[];
		toolChoice: 'auto' | 'required' | 'none';
		ragContext?: string | null;
		memoryContext?: string | null;
	}) {
		return AIRequestCaptureService.startRound({
			interactiveLearningId: params.context.activityId,
			chatId: params.context.chatId,
			userId: params.context.userId,
			courseId: params.context.courseId,
			modelName: params.modelName,
			roundType: params.roundType,
			systemPromptExact: params.systemPrompt,
			messagesExact: params.messages,
			toolsExact: params.runtimeTools,
			requestOptions: {
				toolChoice: params.toolChoice,
				stopWhen: {
					maxToolRoundtrips: params.context.activityConfig.maxToolRoundtrips
				},
				temperature: params.context.activityConfig.temperature ?? 0.7,
				maxOutputTokens: params.context.activityConfig.maxTokens ?? 2000
			},
			ragContextExact: params.ragContext ?? null,
			memoryContextExact: params.memoryContext ?? null,
			requestPayload: {
				modelName: params.modelName,
				system: params.systemPrompt,
				messages: params.messages,
				tools: params.runtimeTools,
				toolChoice: params.toolChoice,
				stopWhen: {
					maxToolRoundtrips: params.context.activityConfig.maxToolRoundtrips
				},
				temperature: params.context.activityConfig.temperature ?? 0.7,
				maxOutputTokens: params.context.activityConfig.maxTokens ?? 2000
			},
			messageCount: params.messages.length,
			toolCount: params.runtimeTools.length,
			ragEnabled: !!params.context.activityConfig.ragEnabled,
			ragContextUsed: !!params.ragContext,
			memoryContextUsed: !!params.memoryContext,
			resumed: params.roundType === 'agent_resume',
			startedAt: new Date(params.startTime)
		});
	}

	static async *executeLoop(
		context: AgentContext,
		userMessage: string,
		userMessageMetadata?: string
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
			await this.logFailureUsage({
				modelName,
				context,
				startTime,
				errorMessage: quotaCheck.reason ?? 'Cuota de uso alcanzada.',
				metadata: {
					phase: 'quota_check'
				}
			});
			yield {
				type: 'error',
				code: 'QUOTA_EXCEEDED',
				message: quotaCheck.reason ?? 'Cuota de uso alcanzada.'
			};
			return;
		}

		let ragContext: string | null = null;
		let memoryContext: string | null = null;
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

		try {
			memoryContext = await AgentMemoryService.buildPromptMemoryContext(context);
		} catch {
			// Continue without memory context.
		}

		const runtimeTools = this.getRuntimeTools(context);
		const systemPrompt = AgentPromptBuilder.buildSystemPrompt(
			config,
			runtimeTools,
			ragContext,
			memoryContext
		);

		await DBAgentMessageUtils.saveAgentMessage({
			chatId: context.chatId,
			role: 'user',
			textContent: userMessage,
			sequenceOrder: 0,
			metadata: userMessageMetadata
		});

		yield { type: 'status', status: 'thinking' };

		const messages = await this.buildMessagesFromDB(context.chatId);

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
				metadata: {
					phase: 'model_build'
				}
			});
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
			finalizationPayload: null,
			streamError: null
		};
		let requestRoundId: string | null = null;

		try {
			const tools = this.buildTools(context, assistantMsgId, runtimeTools);
			const useTools = Object.keys(tools).length > 0 ? tools : undefined;
			const toolChoice = useTools ? this.resolveToolChoice(context, runtimeTools) : undefined;

			try {
				requestRoundId = await this.startCaptureRound({
					context,
					modelName,
					roundType: 'agent',
					startTime,
					systemPrompt,
					messages,
					runtimeTools,
					toolChoice: toolChoice ?? 'none',
					ragContext,
					memoryContext
				});
			} catch (captureError) {
				console.error('[AgentEngine] Failed to start request capture round:', captureError);
			}

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
					const usage = finishResult.usage;
					let usageLogId: string | null = null;
					try {
						const usageLog = await UsageTracker.logUsage({
							modelName,
							userId: context.userId,
							courseId: context.courseId,
							interactiveLearningId: context.activityId,
							chatId: context.chatId,
							requestRoundId: requestRoundId ?? undefined,
							operation: 'chat',
							inputTokens: usage?.inputTokens ?? 0,
							outputTokens: usage?.outputTokens ?? 0,
							durationMs,
							success: !accumulated.streamError,
							errorMessage: accumulated.streamError ?? undefined,
							metadata: {
								toolCallsCount: accumulated.toolCallsCount,
								ragEnabled: config.ragEnabled,
								agentMode: true,
								ragContextUsed: !!ragContext,
								memoryContextUsed: !!memoryContext,
								reasoningTokens: usage?.reasoningTokens,
								cachedInputTokens: usage?.cachedInputTokens,
								streamError: accumulated.streamError ?? undefined
							}
						});
						usageLogId = usageLog?.id ?? null;
					} catch {
						// Usage log failures must not interrupt the stream.
					} finally {
						if (requestRoundId) {
							try {
								await AIRequestCaptureService.finishRound({
									roundId: requestRoundId,
									status: accumulated.streamError ? 'error' : 'success',
									usageLogId,
									responseSummary: {
										finishReason: finishResult.finishReason,
										rawFinishReason: finishResult.rawFinishReason,
										text: finishResult.text,
										warnings: finishResult.warnings,
										request: finishResult.request,
										response: finishResult.response,
										providerMetadata: finishResult.providerMetadata,
										steps: finishResult.steps.map((step) => ({
											finishReason: step.finishReason,
											rawFinishReason: step.rawFinishReason,
											usage: step.usage,
											warnings: step.warnings,
											request: step.request,
											response: step.response,
											providerMetadata: step.providerMetadata,
											toolCalls: step.toolCalls,
											toolResults: step.toolResults
										}))
									},
									providerUsage: {
										usage,
										totalUsage: finishResult.totalUsage
									},
									inputTokens: usage?.inputTokens ?? 0,
									outputTokens: usage?.outputTokens ?? 0,
									cachedInputTokens: usage?.cachedInputTokens,
									reasoningTokens: usage?.reasoningTokens,
									durationMs,
									errorMessage: accumulated.streamError ?? null,
									finishedAt: new Date()
								});
							} catch {
								// Forensic logging must not interrupt the stream.
							}
						}
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
			if (typeof requestRoundId === 'string') {
				try {
					await AIRequestCaptureService.failRound(
						requestRoundId,
						error instanceof Error ? error.message : 'Error inesperado en el motor agentico',
						{
							durationMs: Date.now() - startTime,
							finishedAt: new Date()
						}
					);
				} catch (captureError) {
					console.error('[AgentEngine] Failed to fail request capture round:', captureError);
				}
			}
			await this.logFailureUsage({
				modelName,
				context,
				startTime,
				errorMessage: error instanceof Error ? error.message : 'Error inesperado en el motor agentico',
				metadata: {
					phase: 'execute_loop',
					toolCallsCount: accumulated.toolCallsCount
				}
			});
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
		let memoryContext: string | null = null;
		try {
			memoryContext = await AgentMemoryService.buildPromptMemoryContext(context);
		} catch {
			// Continue without memory context.
		}

		const systemPrompt = AgentPromptBuilder.buildSystemPrompt(config, runtimeTools, null, memoryContext);

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
				metadata: {
					phase: 'resume_model_build',
					resumed: true
				}
			});
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
			finalizationPayload: null,
			streamError: null
		};
		let requestRoundId: string | null = null;

		yield { type: 'status', status: 'thinking' };

		try {
			const tools = this.buildTools(context, assistantMsgId, runtimeTools);
			const useTools = Object.keys(tools).length > 0 ? tools : undefined;
			const toolChoice = useTools ? this.resolveToolChoice(context, runtimeTools) : undefined;

			try {
				requestRoundId = await this.startCaptureRound({
					context,
					modelName,
					roundType: 'agent_resume',
					startTime,
					systemPrompt,
					messages,
					runtimeTools,
					toolChoice: toolChoice ?? 'none',
					ragContext: null,
					memoryContext
				});
			} catch (captureError) {
				console.error('[AgentEngine] Failed to start request capture round on resume:', captureError);
			}

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
					const usage = finishResult.usage;
					let usageLogId: string | null = null;
					try {
						const usageLog = await UsageTracker.logUsage({
							modelName,
							userId: context.userId,
							courseId: context.courseId,
							interactiveLearningId: context.activityId,
							chatId: context.chatId,
							requestRoundId: requestRoundId ?? undefined,
							operation: 'chat',
							inputTokens: usage?.inputTokens ?? 0,
							outputTokens: usage?.outputTokens ?? 0,
							durationMs,
							success: !accumulated.streamError,
							errorMessage: accumulated.streamError ?? undefined,
							metadata: {
								toolCallsCount: accumulated.toolCallsCount,
								agentMode: true,
								resumed: true,
								memoryContextUsed: !!memoryContext,
								reasoningTokens: usage?.reasoningTokens,
								cachedInputTokens: usage?.cachedInputTokens,
								streamError: accumulated.streamError ?? undefined
							}
						});
						usageLogId = usageLog?.id ?? null;
					} catch {
						// Usage log failures must not interrupt the stream.
					} finally {
						if (requestRoundId) {
							try {
								await AIRequestCaptureService.finishRound({
									roundId: requestRoundId,
									status: accumulated.streamError ? 'error' : 'success',
									usageLogId,
									responseSummary: {
										finishReason: finishResult.finishReason,
										rawFinishReason: finishResult.rawFinishReason,
										text: finishResult.text,
										warnings: finishResult.warnings,
										request: finishResult.request,
										response: finishResult.response,
										providerMetadata: finishResult.providerMetadata,
										steps: finishResult.steps.map((step) => ({
											finishReason: step.finishReason,
											rawFinishReason: step.rawFinishReason,
											usage: step.usage,
											warnings: step.warnings,
											request: step.request,
											response: step.response,
											providerMetadata: step.providerMetadata,
											toolCalls: step.toolCalls,
											toolResults: step.toolResults
										}))
									},
									providerUsage: {
										usage,
										totalUsage: finishResult.totalUsage
									},
									inputTokens: usage?.inputTokens ?? 0,
									outputTokens: usage?.outputTokens ?? 0,
									cachedInputTokens: usage?.cachedInputTokens,
									reasoningTokens: usage?.reasoningTokens,
									durationMs,
									errorMessage: accumulated.streamError ?? null,
									finishedAt: new Date()
								});
							} catch {
								// Forensic logging must not interrupt the stream.
							}
						}
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
			if (typeof requestRoundId === 'string') {
				try {
					await AIRequestCaptureService.failRound(
						requestRoundId,
						error instanceof Error ? error.message : 'Error en la continuacion del agente',
						{
							durationMs: Date.now() - startTime,
							finishedAt: new Date()
						}
					);
				} catch (captureError) {
					console.error('[AgentEngine] Failed to fail request capture round on resume:', captureError);
				}
			}
			await this.logFailureUsage({
				modelName,
				context,
				startTime,
				errorMessage: error instanceof Error ? error.message : 'Error en la continuacion del agente',
				metadata: {
					phase: 'resume_loop',
					resumed: true,
					toolCallsCount: accumulated.toolCallsCount
				}
			});
			yield {
				type: 'error',
				code: 'ENGINE_ERROR',
				message: error instanceof Error ? error.message : 'Error en la continuacion del agente'
			};
		}
	}
}
