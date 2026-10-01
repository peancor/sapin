import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type { AgentDisplayMessage, AgentDisplayPart } from '$lib/types/agent';

export class InsightsAgentMessageService {
	static async getDisplayMessages(chatId: string): Promise<AgentDisplayMessage[]> {
		const rawMessages = await db
			.select()
			.from(schema.agentMessage)
			.where(eq(schema.agentMessage.chatId, chatId))
			.orderBy(asc(schema.agentMessage.createdAt), asc(schema.agentMessage.sequenceOrder));

		const assistantMessageIds = rawMessages
			.filter((message) => message.role === 'assistant')
			.map((message) => message.id);

		const toolCallsMap = new Map<string, typeof schema.agentToolCall.$inferSelect[]>();
		if (assistantMessageIds.length > 0) {
			const toolCalls = await db
				.select()
				.from(schema.agentToolCall)
				.where(inArray(schema.agentToolCall.messageId, assistantMessageIds))
				.orderBy(asc(schema.agentToolCall.createdAt));
			for (const toolCall of toolCalls) {
				const bucket = toolCallsMap.get(toolCall.messageId) ?? [];
				bucket.push(toolCall);
				toolCallsMap.set(toolCall.messageId, bucket);
			}
		}

		const messages: AgentDisplayMessage[] = [];
		for (const message of rawMessages) {
			if (message.role !== 'user' && message.role !== 'assistant') continue;
			if (
				message.role === 'user' &&
				message.textContent &&
				/^\[\[.*\]\]$/s.test(message.textContent.trim())
			) {
				continue;
			}

			const parts: AgentDisplayPart[] = [];
			if (message.textContent) {
				parts.push({ kind: 'text', content: message.textContent });
			}

			if (message.role === 'assistant') {
				for (const toolCall of toolCallsMap.get(message.id) ?? []) {
					let args: Record<string, unknown> = {};
					let result: unknown;

					try {
						args = JSON.parse(toolCall.arguments) as Record<string, unknown>;
					} catch {
						args = {};
					}

					try {
						result = toolCall.result ? JSON.parse(toolCall.result) : undefined;
					} catch {
						result = toolCall.result;
					}

					const safeResult =
						result && typeof result === 'object'
							? (result as Record<string, unknown>)
							: null;
					if (safeResult?.rendered === true) continue;

					parts.push({
						kind: 'tool-call',
						toolCallId: toolCall.id,
						toolName: toolCall.toolName,
						toolDisplayName: toolCall.toolName,
						args,
						status: toolCall.status,
						result,
						durationMs: toolCall.durationMs ?? undefined
					});
				}
			}

			if (parts.length === 0) continue;
			messages.push({
				id: message.id,
				role: message.role,
				parts,
				createdAt: message.createdAt
			});
		}

		return messages;
	}
}
