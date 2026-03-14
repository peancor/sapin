import type { AgentContext, AgentStreamPart, ToolDefinitionResolved } from '$lib/types/agent';
import { DBAgentMessageUtils } from '$lib/server/db/agent';
import { auditAction, auditService, auditSeverity, aiLogger } from '$lib/server/logging';
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
	streamError: string | null;
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

function truncateAuditValue(value: unknown, depth: number = 0): unknown {
	if (depth > 2) return '[truncated]';
	if (typeof value === 'string') {
		return value.length > 300 ? `${value.slice(0, 297)}...` : value;
	}
	if (Array.isArray(value)) {
		return value.slice(0, 6).map((item) => truncateAuditValue(item, depth + 1));
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.slice(0, 10)
				.map(([key, nested]) => [key, truncateAuditValue(nested, depth + 1)])
		);
	}
	return value;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isDuplicateToolCallIdError(error: unknown): boolean {
	return /UNIQUE constraint failed: agent_tool_call\.id/i.test(getErrorMessage(error));
}

async function persistToolCallStart(params: {
	context: AgentContext;
	assistantMsgId: string;
	toolCallId: string;
	toolName: string;
	toolDefinitionId?: string;
	toolInput: Record<string, unknown>;
}) {
	const serializedArgs = JSON.stringify(params.toolInput);

	try {
		await DBAgentMessageUtils.saveToolCall({
			id: params.toolCallId,
			messageId: params.assistantMsgId,
			toolName: params.toolName,
			toolDefinitionId: params.toolDefinitionId,
			arguments: serializedArgs,
			status: 'executing'
		});
		return;
	} catch (error) {
		const errorMessage = getErrorMessage(error);

		if (isDuplicateToolCallIdError(error)) {
			const existing = await DBAgentMessageUtils.getToolCall(params.toolCallId);

			await auditService.log({
				action: auditAction.AGENT_TOOL_CALL_DUPLICATE,
				userId: params.context.userId,
				targetType: 'agent_tool_call',
				targetId: params.toolCallId,
				severity: auditSeverity.WARNING,
				details: {
					chatId: params.context.chatId,
					courseId: params.context.courseId ?? null,
					activityId: params.context.activityId,
					assistantMessageId: params.assistantMsgId,
					existingMessageId: existing?.messageId ?? null,
					existingStatus: existing?.status ?? null,
					toolName: params.toolName,
					errorMessage,
					arguments: truncateAuditValue(params.toolInput)
				}
			});

			aiLogger.warn(
				{
					toolCallId: params.toolCallId,
					chatId: params.context.chatId,
					activityId: params.context.activityId,
					assistantMessageId: params.assistantMsgId,
					existingMessageId: existing?.messageId ?? null,
					toolName: params.toolName,
					errorMessage
				},
				'Duplicate agent tool call id detected; reusing existing record'
			);

			await DBAgentMessageUtils.updateToolCall(params.toolCallId, {
				messageId: params.assistantMsgId,
				toolName: params.toolName,
				toolDefinitionId: params.toolDefinitionId,
				arguments: serializedArgs,
				status: 'executing',
				errorMessage: null,
				rejectionReason: null,
				result: null
			});

			return;
		}

		await auditService.log({
			action: auditAction.AGENT_TOOL_CALL_PERSIST_FAILED,
			userId: params.context.userId,
			targetType: 'agent_tool_call',
			targetId: params.toolCallId,
			severity: auditSeverity.ERROR,
			details: {
				chatId: params.context.chatId,
				courseId: params.context.courseId ?? null,
				activityId: params.context.activityId,
				assistantMessageId: params.assistantMsgId,
				toolName: params.toolName,
				errorMessage,
				arguments: truncateAuditValue(params.toolInput)
			}
		});

		aiLogger.error(
			{
				err: error,
				toolCallId: params.toolCallId,
				chatId: params.context.chatId,
				activityId: params.context.activityId,
				assistantMessageId: params.assistantMsgId,
				toolName: params.toolName
			},
			'Failed to persist agent tool call'
		);

		throw error;
	}
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

					await persistToolCallStart({
						context,
						assistantMsgId,
						toolCallId,
						toolName: event.toolName,
						toolDefinitionId: toolDef?.id?.startsWith('__') ? undefined : toolDef?.id,
						toolInput
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
					accumulated.streamError =
						event.error instanceof Error ? event.error.message : 'Error en el stream del agente';
					yield {
						type: 'error',
						code: 'STREAM_ERROR',
						message: accumulated.streamError ?? 'Error en el stream del agente'
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
