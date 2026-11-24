import { error } from '@sveltejs/kit';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, CourseInteractiveAuthUtils, InteractiveChatAuthUtils } from '$lib/server/db';
import {
	chat,
	interactiveLearning,
	message,
	userInteractiveLearningChat as attempt
} from '$lib/server/db/schema';
import { AgentTranscriptService } from '$lib/server/agent/AgentTranscriptService';
import { parseFinalizationMetadata } from '$lib/server/agent/AgentSessionAnalyticsService';
import type { AgentDisplayMessage, AgentDisplayPart } from '$lib/types/agent';
import { stripAgentInternalMarkers } from '$lib/utils/markdownMath';

export async function authorizeConversation(user: App.Locals['user'], ilid: string, cid: string) {
	if (!user) error(401, 'Inicia sesión para ver la conversación.');
	const record = await db
		.select({
			ownerId: chat.userId,
			title: interactiveLearning.name,
			type: interactiveLearning.type,
			createdAt: chat.createdAt,
			metadata: chat.metadata
		})
		.from(attempt)
		.innerJoin(chat, and(eq(chat.id, attempt.chatId), eq(chat.userId, attempt.userId)))
		.innerJoin(interactiveLearning, eq(interactiveLearning.id, attempt.interactiveLearningChatId))
		.where(
			and(
				eq(chat.id, cid),
				eq(interactiveLearning.id, ilid),
				inArray(interactiveLearning.type, ['chat', 'agent'])
			)
		)
		.get();
	if (!record) error(404, 'Conversación no encontrada.');
	const access = await InteractiveChatAuthUtils.userCanAccessInteractiveActivity(
		user.id,
		ilid,
		user.highestRoleLevel
	);
	const isOwner = record.ownerId === user.id;
	const canReview =
		access.isSystemAdmin ||
		CourseInteractiveAuthUtils.STAFF_ROLES.some((role) => role === access.courseRole);
	if (!access.allowed || (!isOwner && !canReview))
		error(403, 'No tienes acceso a esta conversación.');
	const completed =
		record.type === 'agent'
			? !!parseFinalizationMetadata(record.metadata)
			: !!(await db
					.select({ id: message.id })
					.from(message)
					.where(
						and(
							eq(message.chatId, cid),
							eq(message.type, 'ASSISTANT'),
							sql`instr(${message.content}, '[[DONE]]') > 0`
						)
					)
					.limit(1)
					.get());
	return {
		title: record.title,
		ownerId: record.ownerId,
		type: record.type,
		createdAt: record.createdAt,
		completed,
		isOwner,
		canReview
	};
}
function visiblePart(part: AgentDisplayPart): AgentDisplayPart {
	if (part.kind === 'text') return { ...part, content: stripAgentInternalMarkers(part.content) };
	if (part.kind === 'tool-call') {
		const result = part.result as Record<string, unknown> | undefined;
		return {
			...part,
			args: {},
			result: result?.finalized === true ? { finalized: true } : undefined,
			displayResult:
				part.displayResult ??
				(part.status === 'failed' && typeof result?.error === 'string' ? result.error : undefined)
		};
	}
	if (part.kind === 'ui-component' && !part.userResponse && Array.isArray(part.props.questions)) {
		return {
			...part,
			interactive: false,
			props: {
				...part.props,
				questions: part.props.questions.map((q) => ({ question: q?.question, options: q?.options }))
			}
		};
	}
	return part;
}
export async function readConversation(type: string, cid: string): Promise<AgentDisplayMessage[]> {
	if (type === 'agent') {
		return (await AgentTranscriptService.getDisplayMessages(cid)).map((message) => ({
			...message,
			parts: message.parts.map(visiblePart)
		}));
	}
	const rows = await db
		.select({
			id: message.id,
			type: message.type,
			content: message.content,
			createdAt: message.createdAt
		})
		.from(message)
		.where(and(eq(message.chatId, cid), inArray(message.type, ['USER', 'ASSISTANT'])))
		.orderBy(message.createdAt, sql`${message}.rowid`);
	return rows.flatMap((row) => {
		if (/^\[\[.*\]\]$/s.test(row.content.trim())) return [];
		const content = stripAgentInternalMarkers(row.content);
		return content.trim()
			? [
					{
						id: row.id,
						createdAt: row.createdAt,
						role: row.type === 'USER' ? 'user' : 'assistant',
						parts: [{ kind: 'text', content }]
					}
				]
			: [];
	});
}
