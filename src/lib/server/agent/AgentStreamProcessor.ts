import type { AgentContext, AgentStreamPart, ToolDefinitionResolved } from '$lib/types/agent';
import { DBAgentMessageUtils } from '$lib/server/db/agent';
import type { FinalizeActivityPayload } from './AgentFinalizationService';
import type { UISentinel } from './AgentUIRendererService';

export interface HitlSentinel {
	__hitl: true;
	toolCallId: string;
	toolName: string;
	toolDisplayName: string;
	riskLevel: 'low' | 'medium' | 'high';
	args: Record<string, unknown>;
}

export interface FinalizeSentinel {
	__finalize: true;
	summary: string;
	result?: 'completed' | 'passed' | 'failed';
	score?: number;
	feedback?: string;
}

export interface StreamAccumulator {
	text: string;
	toolCallsCount: number;
	hitlTriggered: boolean;
	uiWaitTriggered: boolean;
	finalizationTriggered: boolean;
	finalizationPayload: FinalizeActivityPayload | null;
}

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

export class AgentStreamProcessor {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static async *process(
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
}
