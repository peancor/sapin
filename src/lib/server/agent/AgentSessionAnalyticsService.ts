import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type {
	AgentSessionFinalization,
	AgentSessionSummary,
	AgentUserMessageMetrics
} from '$lib/types/agent';

type MessageRow = typeof schema.agentMessage.$inferSelect;
type ToolCallRow = {
	id: string;
	messageId: string;
	status: string;
	result: string | null;
};
type UIInstanceRow = {
	id: string;
	messageId: string;
	componentKey: string;
	userResponse: string | null;
};
type ChatRow = Pick<typeof schema.chat.$inferSelect, 'id' | 'metadata' | 'createdAt' | 'updatedAt'>;

function isInternalTriggerMessage(content: string | null): boolean {
	return !!content && /^\[\[.*\]\]$/s.test(content.trim());
}

function cleanTextContent(content: string | null | undefined): string | undefined {
	if (!content) return undefined;

	const cleaned = content
		.replace(/\[\[DONE\]\]/g, '')
		.replace(/\[\[CONTEXTO_RAG\]\][\s\S]*?\[\[FIN_CONTEXTO_RAG\]\]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	return cleaned.length > 0 ? cleaned : undefined;
}

function truncateText(content: string | undefined, maxLength = 180): string | undefined {
	if (!content) return undefined;
	if (content.length <= maxLength) return content;
	return `${content.slice(0, maxLength - 1).trimEnd()}...`;
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
	if (!value) return null;

	try {
		const parsed = JSON.parse(value) as unknown;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// Ignore malformed JSON.
	}

	return null;
}

function parseUserMessageMetrics(
	value: string | null | undefined
): AgentUserMessageMetrics | null {
	const parsed = parseJsonObject(value);
	if (!parsed) return null;

	const deviceInfo =
		typeof parsed.deviceInfo === 'object' && parsed.deviceInfo !== null
			? (parsed.deviceInfo as Record<string, unknown>)
			: {};

	return {
		keystrokeCount:
			typeof parsed.keystrokeCount === 'number' ? parsed.keystrokeCount : 0,
		pasteCount: typeof parsed.pasteCount === 'number' ? parsed.pasteCount : 0,
		charCount: typeof parsed.charCount === 'number' ? parsed.charCount : 0,
		wordCount: typeof parsed.wordCount === 'number' ? parsed.wordCount : 0,
		timeSpentSeconds:
			typeof parsed.timeSpentSeconds === 'number' ? parsed.timeSpentSeconds : 0,
		editCount: typeof parsed.editCount === 'number' ? parsed.editCount : 0,
		deleteCount: typeof parsed.deleteCount === 'number' ? parsed.deleteCount : 0,
		startTimestamp:
			typeof parsed.startTimestamp === 'number' ? parsed.startTimestamp : 0,
		deviceInfo: {
			isMobile: deviceInfo.isMobile === true,
			userAgent: typeof deviceInfo.userAgent === 'string' ? deviceInfo.userAgent : '',
			screenSize: typeof deviceInfo.screenSize === 'string' ? deviceInfo.screenSize : ''
		}
	};
}

function parseFinalizationMetadata(
	value: string | null | undefined
): AgentSessionFinalization | null {
	const parsed = parseJsonObject(value);
	const finalization =
		parsed && typeof parsed.agentFinalization === 'object' && parsed.agentFinalization !== null
			? (parsed.agentFinalization as Record<string, unknown>)
			: null;

	if (!finalization || typeof finalization.executedAt !== 'string') return null;

	const payload =
		typeof finalization.payload === 'object' && finalization.payload !== null
			? (finalization.payload as Record<string, unknown>)
			: {};

	const finalizationConfig = parseJsonObject(
		typeof finalization.finalizationConfig === 'string'
			? finalization.finalizationConfig
			: undefined
	);

	return {
		executedAt: finalization.executedAt,
		handler:
			finalization.handler === 'mark_complete_only' ||
			finalization.handler === 'notify_only' ||
			finalization.handler === 'mark_complete_and_notify'
				? finalization.handler
				: 'mark_complete_and_notify',
		toolCallId: typeof finalization.toolCallId === 'string' ? finalization.toolCallId : '',
		toolName: typeof finalization.toolName === 'string' ? finalization.toolName : '',
		assistantMessageId:
			typeof finalization.assistantMessageId === 'string'
				? finalization.assistantMessageId
				: '',
		payload: {
			summary: typeof payload.summary === 'string' ? payload.summary : '',
			result:
				payload.result === 'completed' || payload.result === 'passed' || payload.result === 'failed'
					? payload.result
					: undefined,
			score: typeof payload.score === 'number' ? payload.score : undefined,
			feedback: typeof payload.feedback === 'string' ? payload.feedback : undefined
		},
		finalizationConfig:
			finalizationConfig ??
			(typeof finalization.finalizationConfig === 'object' &&
			finalization.finalizationConfig !== null &&
			!Array.isArray(finalization.finalizationConfig)
				? (finalization.finalizationConfig as Record<string, unknown>)
				: null)
	};
}

function isRenderedToolResult(result: string | null | undefined): boolean {
	const parsed = parseJsonObject(result);
	return parsed?.rendered === true;
}

function hasVisibleAssistantContent(
	message: MessageRow,
	toolCalls: ToolCallRow[],
	uiInstances: UIInstanceRow[]
): boolean {
	if (cleanTextContent(message.textContent)) return true;
	if (uiInstances.length > 0) return true;
	return toolCalls.some((toolCall) => !isRenderedToolResult(toolCall.result));
}

function buildSummary(params: {
	chat: ChatRow;
	messages: MessageRow[];
	toolCallsByMessageId: Map<string, ToolCallRow[]>;
	uiInstancesByMessageId: Map<string, UIInstanceRow[]>;
}): AgentSessionSummary {
	const { chat, messages, toolCallsByMessageId, uiInstancesByMessageId } = params;

	const meaningfulTexts: string[] = [];
	const messageMetricsById: Record<string, AgentUserMessageMetrics> = {};

	let userMessages = 0;
	let assistantMessages = 0;
	let totalKeystrokeCount = 0;
	let totalPasteCount = 0;
	let totalCharCount = 0;
	let totalWordCount = 0;
	let totalTimeSpentSeconds = 0;
	let mobileCount = 0;
	let metricsMessagesCount = 0;

	for (const message of messages) {
		const messageText = cleanTextContent(message.textContent);

		if (message.role === 'user') {
			if (isInternalTriggerMessage(message.textContent)) continue;

			userMessages += 1;
			if (messageText) meaningfulTexts.push(messageText);

			const metrics = parseUserMessageMetrics(message.metadata);
			if (metrics) {
				messageMetricsById[message.id] = metrics;
				metricsMessagesCount += 1;
				totalKeystrokeCount += metrics.keystrokeCount;
				totalPasteCount += metrics.pasteCount;
				totalCharCount += metrics.charCount;
				totalWordCount += metrics.wordCount;
				totalTimeSpentSeconds += metrics.timeSpentSeconds;
				if (metrics.deviceInfo.isMobile) mobileCount += 1;
			}
			continue;
		}

		if (message.role !== 'assistant') continue;

		const toolCalls = toolCallsByMessageId.get(message.id) ?? [];
		const uiInstances = uiInstancesByMessageId.get(message.id) ?? [];
		if (!hasVisibleAssistantContent(message, toolCalls, uiInstances)) continue;

		assistantMessages += 1;
		if (messageText) meaningfulTexts.push(messageText);
	}

	const allToolCalls = Array.from(toolCallsByMessageId.values()).flat();
	const allUiInstances = Array.from(uiInstancesByMessageId.values()).flat();

	const failedToolCalls = allToolCalls.filter(
		(toolCall) => toolCall.status === 'failed' || toolCall.status === 'rejected'
	).length;
	const pendingToolCalls = allToolCalls.filter((toolCall) =>
		['pending', 'awaiting_confirmation', 'awaiting_ui_response', 'executing'].includes(
			toolCall.status
		)
	).length;
	const respondedUiComponents = allUiInstances.filter(
		(uiInstance) => !!uiInstance.userResponse
	).length;

	const previewText =
		truncateText(meaningfulTexts[0]) ??
		(allUiInstances[0] ? `Componente ${allUiInstances[0].componentKey}` : undefined);
	const latestMeaningfulText = truncateText(meaningfulTexts[meaningfulTexts.length - 1]);
	const latestText =
		latestMeaningfulText && latestMeaningfulText !== previewText
			? latestMeaningfulText
			: undefined;

	const finalization = parseFinalizationMetadata(chat.metadata);
	const status: AgentSessionSummary['status'] = finalization
		? 'completed'
		: failedToolCalls > 0
			? 'attention'
			: 'pending';

	return {
		status,
		hasStudentMessages: userMessages > 0,
		previewText,
		latestText,
		lastActivityAt: chat.updatedAt ?? chat.createdAt,
		finalization,
		stats: {
			totalMessages: userMessages + assistantMessages,
			userMessages,
			assistantMessages,
			totalToolCalls: allToolCalls.length,
			failedToolCalls,
			pendingToolCalls,
			totalUiComponents: allUiInstances.length,
			respondedUiComponents
		},
		globalStats: {
			totalMessages: userMessages + assistantMessages,
			totalUserMessages: userMessages,
			totalAssistantMessages: assistantMessages,
			totalToolCalls: allToolCalls.length,
			totalUiComponents: allUiInstances.length,
			totalKeystrokeCount,
			totalPasteCount,
			totalTimeSpentSeconds,
			averageCharCount:
				metricsMessagesCount > 0 ? Math.round(totalCharCount / metricsMessagesCount) : 0,
			averageWordCount:
				metricsMessagesCount > 0 ? Math.round(totalWordCount / metricsMessagesCount) : 0,
			averageTimeSpentSeconds:
				metricsMessagesCount > 0 ? Math.round(totalTimeSpentSeconds / metricsMessagesCount) : 0,
			mobileUsage:
				metricsMessagesCount > 0 ? Math.round((mobileCount / metricsMessagesCount) * 100) : 0,
			desktopUsage:
				metricsMessagesCount > 0
					? Math.round(((metricsMessagesCount - mobileCount) / metricsMessagesCount) * 100)
					: 0,
			messagesWithMetrics: metricsMessagesCount
		},
		messageMetricsById
	};
}

export class AgentSessionAnalyticsService {
	static summarizeSession(params: {
		chat: ChatRow;
		messages: MessageRow[];
		toolCallsByMessageId: Map<string, ToolCallRow[]>;
		uiInstancesByMessageId: Map<string, UIInstanceRow[]>;
	}): AgentSessionSummary {
		return buildSummary(params);
	}

	static summarizeSessions(params: {
		chats: ChatRow[];
		messages: MessageRow[];
		toolCalls: ToolCallRow[];
		uiInstances: UIInstanceRow[];
	}): Map<string, AgentSessionSummary> {
		const messagesByChatId = new Map<string, MessageRow[]>();
		for (const message of params.messages) {
			const bucket = messagesByChatId.get(message.chatId) ?? [];
			bucket.push(message);
			messagesByChatId.set(message.chatId, bucket);
		}

		const messageById = new Map(params.messages.map((message) => [message.id, message]));
		const toolCallsByMessageId = new Map<string, ToolCallRow[]>();
		for (const toolCall of params.toolCalls) {
			const bucket = toolCallsByMessageId.get(toolCall.messageId) ?? [];
			bucket.push(toolCall);
			toolCallsByMessageId.set(toolCall.messageId, bucket);
		}

		const uiInstancesByMessageId = new Map<string, UIInstanceRow[]>();
		for (const uiInstance of params.uiInstances) {
			if (!messageById.has(uiInstance.messageId)) continue;
			const bucket = uiInstancesByMessageId.get(uiInstance.messageId) ?? [];
			bucket.push(uiInstance);
			uiInstancesByMessageId.set(uiInstance.messageId, bucket);
		}

		const result = new Map<string, AgentSessionSummary>();
		for (const chat of params.chats) {
			const chatMessages = messagesByChatId.get(chat.id) ?? [];
			const chatMessageIds = new Set(chatMessages.map((message) => message.id));
			const chatToolCallsByMessageId = new Map<string, ToolCallRow[]>();
			const chatUiInstancesByMessageId = new Map<string, UIInstanceRow[]>();

			for (const messageId of chatMessageIds) {
				const messageToolCalls = toolCallsByMessageId.get(messageId);
				if (messageToolCalls) {
					chatToolCallsByMessageId.set(messageId, messageToolCalls);
				}

				const messageUiInstances = uiInstancesByMessageId.get(messageId);
				if (messageUiInstances) {
					chatUiInstancesByMessageId.set(messageId, messageUiInstances);
				}
			}

			result.set(
				chat.id,
				buildSummary({
					chat,
					messages: chatMessages,
					toolCallsByMessageId: chatToolCallsByMessageId,
					uiInstancesByMessageId: chatUiInstancesByMessageId
				})
			);
		}

		return result;
	}

	static async getSessionAnalytics(chatId: string): Promise<AgentSessionSummary> {
		const chat = await db
			.select({
				id: schema.chat.id,
				metadata: schema.chat.metadata,
				createdAt: schema.chat.createdAt,
				updatedAt: schema.chat.updatedAt
			})
			.from(schema.chat)
			.where(eq(schema.chat.id, chatId))
			.get();

		if (!chat) {
			throw new Error(`Chat ${chatId} not found`);
		}

		const messages = await db
			.select()
			.from(schema.agentMessage)
			.where(eq(schema.agentMessage.chatId, chatId))
			.orderBy(asc(schema.agentMessage.createdAt), asc(schema.agentMessage.sequenceOrder));

		const assistantMessageIds = messages
			.filter((message) => message.role === 'assistant')
			.map((message) => message.id);

		const toolCalls =
			assistantMessageIds.length > 0
				? await db
						.select({
							id: schema.agentToolCall.id,
							messageId: schema.agentToolCall.messageId,
							status: schema.agentToolCall.status,
							result: schema.agentToolCall.result
						})
						.from(schema.agentToolCall)
						.where(inArray(schema.agentToolCall.messageId, assistantMessageIds))
				: [];

		const uiInstances =
			assistantMessageIds.length > 0
				? await db
						.select({
							id: schema.agentUIInstance.id,
							messageId: schema.agentUIInstance.messageId,
							componentKey: schema.agentUIComponent.componentKey,
							userResponse: schema.agentUIInstance.userResponse
						})
						.from(schema.agentUIInstance)
						.innerJoin(
							schema.agentUIComponent,
							eq(schema.agentUIInstance.uiComponentId, schema.agentUIComponent.id)
						)
						.where(inArray(schema.agentUIInstance.messageId, assistantMessageIds))
				: [];

		return this.summarizeSessions({
			chats: [chat],
			messages,
			toolCalls,
			uiInstances
		}).get(chatId)!;
	}
}
