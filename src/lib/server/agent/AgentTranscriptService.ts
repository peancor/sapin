import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type { AgentDisplayMessage, AgentDisplayPart } from '$lib/types/agent';
import { uiComponentRequiresResponse } from '$lib/utils/agentUI';

type ToolCallRow = {
	id: string;
	messageId: string;
	toolName: string;
	toolDisplayName: string | null;
	arguments: string;
	result: string | null;
	status: string;
	durationMs: number | null;
};

type UIInstanceRow = typeof schema.agentUIInstance.$inferSelect & {
	componentKey: string;
};

function isInternalTriggerMessage(content: string | null): boolean {
	return !!content && /^\[\[.*\]\]$/s.test(content.trim());
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
	if (!value) return {};

	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function parseJsonUnknown(value: string | null | undefined): unknown {
	if (!value) return undefined;

	try {
		return JSON.parse(value) as unknown;
	} catch {
		return value;
	}
}

export class AgentTranscriptService {
	static async getDisplayMessages(chatId: string): Promise<AgentDisplayMessage[]> {
		const rawMessages = await db
			.select()
			.from(schema.agentMessage)
			.where(eq(schema.agentMessage.chatId, chatId))
			.orderBy(asc(schema.agentMessage.createdAt), asc(schema.agentMessage.sequenceOrder));

		const assistantMessageIds = rawMessages
			.filter((message) => message.role === 'assistant')
			.map((message) => message.id);

		const toolCallsByMessageId = new Map<string, ToolCallRow[]>();
		const uiInstancesByMessageId = new Map<string, UIInstanceRow[]>();

		if (assistantMessageIds.length > 0) {
			const toolCalls = await db
				.select({
					id: schema.agentToolCall.id,
					messageId: schema.agentToolCall.messageId,
					toolName: schema.agentToolCall.toolName,
					toolDisplayName: schema.agentToolDefinition.displayName,
					arguments: schema.agentToolCall.arguments,
					result: schema.agentToolCall.result,
					status: schema.agentToolCall.status,
					durationMs: schema.agentToolCall.durationMs
				})
				.from(schema.agentToolCall)
				.leftJoin(
					schema.agentToolDefinition,
					eq(schema.agentToolCall.toolDefinitionId, schema.agentToolDefinition.id)
				)
				.where(inArray(schema.agentToolCall.messageId, assistantMessageIds))
				.orderBy(asc(schema.agentToolCall.createdAt));

			for (const toolCall of toolCalls) {
				const bucket = toolCallsByMessageId.get(toolCall.messageId) ?? [];
				bucket.push(toolCall);
				toolCallsByMessageId.set(toolCall.messageId, bucket);
			}

			const uiRows = await db
				.select({
					instance: schema.agentUIInstance,
					componentKey: schema.agentUIComponent.componentKey
				})
				.from(schema.agentUIInstance)
				.innerJoin(
					schema.agentUIComponent,
					eq(schema.agentUIInstance.uiComponentId, schema.agentUIComponent.id)
				)
				.where(inArray(schema.agentUIInstance.messageId, assistantMessageIds))
				.orderBy(asc(schema.agentUIInstance.createdAt));

			for (const row of uiRows) {
				const instance = { ...row.instance, componentKey: row.componentKey };
				const bucket = uiInstancesByMessageId.get(row.instance.messageId) ?? [];
				bucket.push(instance);
				uiInstancesByMessageId.set(row.instance.messageId, bucket);
			}
		}

		const displayMessages: AgentDisplayMessage[] = [];

		for (const message of rawMessages) {
			if (message.role !== 'user' && message.role !== 'assistant') continue;
			if (message.role === 'user' && isInternalTriggerMessage(message.textContent)) continue;

			const parts: AgentDisplayPart[] = [];

			if (message.textContent) {
				parts.push({ kind: 'text', content: message.textContent });
			}

			if (message.role === 'assistant') {
				for (const toolCall of toolCallsByMessageId.get(message.id) ?? []) {
					const args = parseJsonRecord(toolCall.arguments);
					const result = parseJsonUnknown(toolCall.result);
					const cleanResult =
						result && typeof result === 'object' && !Array.isArray(result)
							? (result as Record<string, unknown>)
							: null;

					if (cleanResult?.rendered === true) continue;

					parts.push({
						kind: 'tool-call',
						toolCallId: toolCall.id,
						toolName: toolCall.toolName,
						toolDisplayName: toolCall.toolDisplayName ?? toolCall.toolName,
						args,
						status: toolCall.status,
						result,
						durationMs: toolCall.durationMs ?? undefined
					});
				}

				for (const uiInstance of uiInstancesByMessageId.get(message.id) ?? []) {
					const props = parseJsonRecord(uiInstance.props);
					const userResponse = uiInstance.userResponse
						? parseJsonRecord(uiInstance.userResponse)
						: undefined;

					parts.push({
						kind: 'ui-component',
						instanceId: uiInstance.id,
						componentKey: uiInstance.componentKey,
						props,
						interactive: uiComponentRequiresResponse(uiInstance.componentKey) && !userResponse,
						userResponse
					});
				}
			}

			if (parts.length === 0) continue;

			displayMessages.push({
				id: message.id,
				role: message.role,
				parts,
				createdAt: message.createdAt
			});
		}

		return displayMessages;
	}
}
