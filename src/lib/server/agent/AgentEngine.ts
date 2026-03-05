import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { nanoid } from 'nanoid';
import type { AgentContext, AgentStreamPart, ToolDefinitionResolved } from '$lib/types/agent';
import { ModelResolver } from '$lib/server/ai/services/ModelResolver';
import { UsageTracker } from '$lib/server/ai/services/UsageTracker';
import { RagService } from '$lib/server/ai/services/RagService';
import { DBAgentActivityUtils, DBAgentUIUtils, DBAgentMessageUtils } from '$lib/server/db/agent';
import { ToolManager } from './ToolManager';
import { ToolExecutor } from './ToolExecutor';
import { AgentPromptBuilder } from './AgentPromptBuilder';
import { AgentFinalizationService, type FinalizeActivityPayload } from './AgentFinalizationService';
import { graphPlotPropsSchema } from '$lib/components/charts/jsxgraph/schema';

interface UISentinel {
	__uiComponent: true;
	instanceId: string;
	componentKey: string;
	props: Record<string, unknown>;
	interactive: boolean;
}

interface HitlSentinel {
	__hitl: true;
	toolCallId: string;
	toolName: string;
	toolDisplayName: string;
	riskLevel: 'low' | 'medium' | 'high';
	args: Record<string, unknown>;
}

interface FinalizeSentinel {
	__finalize: true;
	summary: string;
	result?: 'completed' | 'passed' | 'failed';
	score?: number;
	feedback?: string;
}

interface StreamAccumulator {
	text: string;
	toolCallsCount: number;
	hitlTriggered: boolean;
	uiWaitTriggered: boolean;
	finalizationTriggered: boolean;
	finalizationPayload: FinalizeActivityPayload | null;
}

type UIInputValidationResult =
	| { ok: true; input: Record<string, unknown> }
	| { ok: false; errorMessage: string };

function isUISentinel(value: unknown): value is UISentinel {
	return (
		typeof value === 'object' &&
		value !== null &&
		'__uiComponent' in value &&
		(value as Record<string, unknown>).__uiComponent === true
	);
}

function isHitlSentinel(value: unknown): value is HitlSentinel {
	return (
		typeof value === 'object' &&
		value !== null &&
		'__hitl' in value &&
		(value as Record<string, unknown>).__hitl === true
	);
}

function isFinalizeSentinel(value: unknown): value is FinalizeSentinel {
	return (
		typeof value === 'object' &&
		value !== null &&
		'__finalize' in value &&
		(value as Record<string, unknown>).__finalize === true
	);
}

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
				const componentKey = toolDef.executorConfig.componentKey as string;
				const interactive = (toolDef.executorConfig.interactive as boolean) ?? false;
				const instanceId = nanoid();

				if (!context.enabledUIComponentKeys.includes(componentKey)) {
					return {
						error: `UI component "${componentKey}" is not enabled for this activity.`
					};
				}

				const validatedInput = this.validateUIRendererInput(componentKey, input);
				if (!validatedInput.ok) {
					return {
						error: validatedInput.errorMessage
					};
				}

				let uiInput = validatedInput.input;
				if (componentKey === 'SharedImageCard') {
					const resourceId = validatedInput.input.resourceId as string;
					const resolved = await DBAgentActivityUtils.resolveSharedImageResource(
						context.activityId,
						resourceId
					);

					if (!resolved.ok) {
						return {
							error: resolved.error
						};
					}

					const title =
						typeof validatedInput.input.title === 'string' &&
						validatedInput.input.title.trim().length > 0
							? validatedInput.input.title.trim()
							: undefined;
					const caption =
						typeof validatedInput.input.caption === 'string' &&
						validatedInput.input.caption.trim().length > 0
							? validatedInput.input.caption.trim()
							: undefined;

					uiInput = {
						resourceId: resolved.resource.resourceId,
						fileId: resolved.resource.fileId,
						name: resolved.resource.name,
						mimeType: resolved.resource.mimeType,
						...(title ? { title } : {}),
						...(caption ? { caption } : {})
					};
				}

				const uiComp = await DBAgentUIUtils.getUIComponentByKey(componentKey);
				if (!uiComp) {
					return {
						error: `UI component "${componentKey}" was not found in the registry.`
					};
				}

				await DBAgentUIUtils.saveUIInstance({
					id: instanceId,
					messageId: assistantMsgId,
					uiComponentId: uiComp.id,
					componentKey,
					props: JSON.stringify(uiInput),
					metadata: JSON.stringify({ componentKey, toolCallId })
				});

				return {
					__uiComponent: true,
					instanceId,
					componentKey,
					props: uiInput,
					interactive
				} satisfies UISentinel;
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

	private static validateUIRendererInput(
		componentKey: string,
		input: Record<string, unknown>
	): UIInputValidationResult {
		if (componentKey === 'SharedImageCard') {
			const resourceId =
				typeof input.resourceId === 'string' && input.resourceId.trim().length > 0
					? input.resourceId.trim()
					: null;
			if (!resourceId) {
				return {
					ok: false,
					errorMessage: 'Invalid shared image config: resourceId is required.'
				};
			}

			if (input.title !== undefined && typeof input.title !== 'string') {
				return {
					ok: false,
					errorMessage: 'Invalid shared image config: title must be a string.'
				};
			}
			if (input.caption !== undefined && typeof input.caption !== 'string') {
				return {
					ok: false,
					errorMessage: 'Invalid shared image config: caption must be a string.'
				};
			}

			const normalized: Record<string, unknown> = { resourceId };
			if (typeof input.title === 'string' && input.title.trim().length > 0) {
				normalized.title = input.title.trim();
			}
			if (typeof input.caption === 'string' && input.caption.trim().length > 0) {
				normalized.caption = input.caption.trim();
			}
			return { ok: true, input: normalized };
		}

		if (componentKey === 'GraphPlotCard') {
			const parsed = graphPlotPropsSchema.safeParse(input);
			if (!parsed.success) {
				const issue = parsed.error.issues[0];
				return {
					ok: false,
					errorMessage: `Invalid graph plot config: ${issue?.message ?? 'schema validation failed'}`
				};
			}

			return { ok: true, input: parsed.data };
		}

		return { ok: true, input };
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private static async *processStream(
		result: any,
		context: AgentContext,
		runtimeTools: ToolDefinitionResolved[],
		assistantMsgId: string,
		accumulated: StreamAccumulator
	): AsyncGenerator<AgentStreamPart> {
		for await (const event of result.fullStream) {
			switch (event.type) {
				case 'text-delta':
					accumulated.text += event.text;
					yield { type: 'text-delta', text: event.text };
					break;

				case 'tool-call': {
					accumulated.toolCallsCount++;
					const toolDef = runtimeTools.find((t) => t.name === event.toolName);
					const toolCallId = event.toolCallId;
					const toolInput = event.input as Record<string, unknown>;

					await DBAgentMessageUtils.saveToolCall({
						id: toolCallId,
						messageId: assistantMsgId,
						toolName: event.toolName,
						toolDefinitionId: toolDef?.id?.startsWith('__') ? undefined : toolDef?.id,
						arguments: JSON.stringify(toolInput),
						status: 'executing'
					});

					yield {
						type: 'tool-call-start',
						toolCallId,
						toolName: event.toolName,
						toolDisplayName: toolDef?.displayName ?? event.toolName,
						args: toolInput
					};

					yield {
						type: 'tool-call-delta',
						toolCallId,
						status: 'executing',
						progressText: `Ejecutando ${toolDef?.displayName ?? event.toolName}...`
					};
					break;
				}

				case 'tool-result': {
					const toolCallId = event.toolCallId;
					const toolOutput = event.output as unknown;

					if (isUISentinel(toolOutput)) {
						yield {
							type: 'ui-component',
							instanceId: toolOutput.instanceId,
							componentKey: toolOutput.componentKey,
							props: toolOutput.props,
							interactive: toolOutput.interactive
						};

						const cleanResult = {
							rendered: true,
							componentKey: toolOutput.componentKey,
							instanceId: toolOutput.instanceId
						};

						if (toolOutput.interactive) {
							await DBAgentMessageUtils.updateToolCall(toolCallId, {
								result: JSON.stringify(cleanResult),
								status: 'awaiting_ui_response'
							});

							await DBAgentMessageUtils.updateAgentMessage(assistantMsgId, {
								textContent: accumulated.text,
								finishReason: 'ui_wait'
							});

							accumulated.uiWaitTriggered = true;
						} else {
							await DBAgentMessageUtils.updateToolCall(toolCallId, {
								result: JSON.stringify(cleanResult),
								status: 'completed'
							});

							await DBAgentMessageUtils.saveAgentMessage({
								chatId: context.chatId,
								role: 'tool',
								textContent: JSON.stringify(cleanResult),
								toolCallId,
								toolName: event.toolName,
								sequenceOrder: 2
							});
						}

						break;
					}

					if (isHitlSentinel(toolOutput)) {
						await DBAgentMessageUtils.updateAgentMessage(assistantMsgId, {
							textContent: accumulated.text,
							finishReason: 'hitl'
						});

						yield {
							type: 'tool-confirm-required',
							toolCallId: toolOutput.toolCallId,
							toolName: toolOutput.toolName,
							toolDisplayName: toolOutput.toolDisplayName,
							args: toolOutput.args,
							riskLevel: toolOutput.riskLevel,
							confirmationMessage: `¿Autorizar la ejecucion de "${toolOutput.toolDisplayName}"?`
						};

						accumulated.hitlTriggered = true;
						break;
					}

					if (isFinalizeSentinel(toolOutput)) {
						const finalizedResult = {
							finalized: true,
							summary: toolOutput.summary,
							result: toolOutput.result,
							score: toolOutput.score,
							feedback: toolOutput.feedback
						};

						await DBAgentMessageUtils.updateToolCall(toolCallId, {
							result: JSON.stringify(finalizedResult),
							status: 'completed'
						});

						await DBAgentMessageUtils.saveAgentMessage({
							chatId: context.chatId,
							role: 'tool',
							textContent: JSON.stringify(finalizedResult),
							toolCallId,
							toolName: event.toolName,
							sequenceOrder: 2
						});

						accumulated.finalizationTriggered = true;
						accumulated.finalizationPayload = {
							summary: toolOutput.summary,
							result: toolOutput.result,
							score: toolOutput.score,
							feedback: toolOutput.feedback,
							toolCallId,
							toolName: event.toolName
						};

						yield {
							type: 'tool-result',
							toolCallId,
							toolName: event.toolName,
							result: finalizedResult,
							displayResult: 'Actividad finalizada.',
							status: 'completed',
							durationMs: 0
						};

						break;
					}

					const toolOutputObj = toolOutput as Record<string, unknown> | null;
					const isError =
						toolOutputObj !== null && typeof toolOutputObj === 'object' && 'error' in toolOutputObj;

					await DBAgentMessageUtils.updateToolCall(toolCallId, {
						result: JSON.stringify(toolOutput),
						status: isError ? 'failed' : 'completed',
						errorMessage: isError ? (toolOutputObj?.error as string) : undefined
					});

					await DBAgentMessageUtils.saveAgentMessage({
						chatId: context.chatId,
						role: 'tool',
						textContent: JSON.stringify(toolOutput),
						toolCallId,
						toolName: event.toolName,
						sequenceOrder: 2
					});

					yield {
						type: 'tool-result',
						toolCallId,
						toolName: event.toolName,
						result: toolOutput,
						displayResult: isError ? `Error: ${toolOutputObj?.error}` : undefined,
						status: isError ? 'failed' : 'completed',
						durationMs: 0
					};
					break;
				}

				case 'error':
					yield {
						type: 'error',
						code: 'STREAM_ERROR',
						message:
							event.error instanceof Error ? event.error.message : 'Error en el stream del agente'
					};
					break;
			}

			if (
				accumulated.hitlTriggered ||
				accumulated.uiWaitTriggered ||
				accumulated.finalizationTriggered
			) {
				break;
			}
		}
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

			for await (const part of this.processStream(
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

			for await (const part of this.processStream(
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
