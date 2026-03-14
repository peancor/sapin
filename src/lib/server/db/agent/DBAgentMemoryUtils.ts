import { and, desc, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '..';
import * as schema from '../schema';
import type {
	AgentMemoryCanvasRecord,
	AgentMemoryCanvasRevisionRecord,
	AgentMemoryCanvasSyncEventRecord,
	MemoryCanvasScopeType,
	MemoryCanvasSyncStatus
} from '$lib/types/agentMemory';

type CanvasScopeParams = {
	scopeType: MemoryCanvasScopeType;
	scopeKey: string;
};

type UpsertCanvasParams = CanvasScopeParams & {
	courseId: string | null;
	activityId: string | null;
	studentId: string;
	content: string;
	revision: number;
	lastSourceChatId?: string | null;
	lastSourceToolCallId?: string | null;
	lastModelName?: string | null;
};

type CreateRevisionParams = {
	canvasId: string;
	scopeType: MemoryCanvasScopeType;
	scopeKey: string;
	courseId: string | null;
	activityId: string | null;
	studentId: string;
	revision: number;
	content: string;
	changeSummary?: string | null;
	sourceChatId?: string | null;
	sourceToolCallId?: string | null;
	modelName?: string | null;
};

type CreateSyncEventParams = {
	canvasId?: string | null;
	scopeType: MemoryCanvasScopeType;
	scopeKey: string;
	courseId: string | null;
	activityId: string | null;
	studentId: string;
	chatId?: string | null;
	toolCallId?: string | null;
	modelName?: string | null;
	status: MemoryCanvasSyncStatus;
	changeSummary?: string | null;
	errorMessage?: string | null;
};

function normalizeCanvasRow(row: typeof schema.agentMemoryCanvas.$inferSelect): AgentMemoryCanvasRecord {
	return {
		id: row.id,
		scopeType: row.scopeType,
		scopeKey: row.scopeKey,
		courseId: row.courseId ?? null,
		activityId: row.activityId ?? null,
		studentId: row.studentId,
		content: row.content,
		revision: row.revision,
		lastSourceChatId: row.lastSourceChatId ?? null,
		lastSourceToolCallId: row.lastSourceToolCallId ?? null,
		lastModelName: row.lastModelName ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function normalizeRevisionRow(
	row: typeof schema.agentMemoryCanvasRevision.$inferSelect
): AgentMemoryCanvasRevisionRecord {
	return {
		id: row.id,
		canvasId: row.canvasId,
		scopeType: row.scopeType,
		scopeKey: row.scopeKey,
		courseId: row.courseId ?? null,
		activityId: row.activityId ?? null,
		studentId: row.studentId,
		revision: row.revision,
		content: row.content,
		changeSummary: row.changeSummary ?? null,
		sourceEventType: 'sync_update',
		sourceChatId: row.sourceChatId ?? null,
		sourceToolCallId: row.sourceToolCallId ?? null,
		modelName: row.modelName ?? null,
		createdAt: row.createdAt
	};
}

function normalizeSyncEventRow(
	row: typeof schema.agentMemoryCanvasSyncEvent.$inferSelect
): AgentMemoryCanvasSyncEventRecord {
	return {
		id: row.id,
		canvasId: row.canvasId ?? null,
		scopeType: row.scopeType,
		scopeKey: row.scopeKey,
		courseId: row.courseId ?? null,
		activityId: row.activityId ?? null,
		studentId: row.studentId,
		chatId: row.chatId ?? null,
		toolCallId: row.toolCallId ?? null,
		modelName: row.modelName ?? null,
		status: row.status,
		changeSummary: row.changeSummary ?? null,
		errorMessage: row.errorMessage ?? null,
		createdAt: row.createdAt
	};
}

export default class DBAgentMemoryUtils {
	static async getCanvasByScope(
		params: CanvasScopeParams
	): Promise<AgentMemoryCanvasRecord | null> {
		const [row] = await db
			.select()
			.from(schema.agentMemoryCanvas)
			.where(
				and(
					eq(schema.agentMemoryCanvas.scopeType, params.scopeType),
					eq(schema.agentMemoryCanvas.scopeKey, params.scopeKey)
				)
			)
			.limit(1);

		return row ? normalizeCanvasRow(row) : null;
	}

	static async listCanvasesByScopeKeys(scopeKeys: string[]): Promise<AgentMemoryCanvasRecord[]> {
		if (scopeKeys.length === 0) return [];

		const rows = await db
			.select()
			.from(schema.agentMemoryCanvas)
			.where(inArray(schema.agentMemoryCanvas.scopeKey, scopeKeys));

		return rows.map(normalizeCanvasRow);
	}

	static async upsertCanvas(params: UpsertCanvasParams): Promise<AgentMemoryCanvasRecord> {
		const now = new Date();
		const existing = await this.getCanvasByScope(params);

		if (existing) {
			await db
				.update(schema.agentMemoryCanvas)
				.set({
					courseId: params.courseId,
					activityId: params.activityId,
					studentId: params.studentId,
					content: params.content,
					revision: params.revision,
					lastSourceChatId: params.lastSourceChatId ?? null,
					lastSourceToolCallId: params.lastSourceToolCallId ?? null,
					lastModelName: params.lastModelName ?? null,
					updatedAt: now
				})
				.where(eq(schema.agentMemoryCanvas.id, existing.id));

			const [updated] = await db
				.select()
				.from(schema.agentMemoryCanvas)
				.where(eq(schema.agentMemoryCanvas.id, existing.id))
				.limit(1);

			return normalizeCanvasRow(updated);
		}

		const id = nanoid();
		await db.insert(schema.agentMemoryCanvas).values({
			id,
			scopeType: params.scopeType,
			scopeKey: params.scopeKey,
			courseId: params.courseId,
			activityId: params.activityId,
			studentId: params.studentId,
			content: params.content,
			revision: params.revision,
			lastSourceChatId: params.lastSourceChatId ?? null,
			lastSourceToolCallId: params.lastSourceToolCallId ?? null,
			lastModelName: params.lastModelName ?? null,
			createdAt: now,
			updatedAt: now
		});

		const [created] = await db
			.select()
			.from(schema.agentMemoryCanvas)
			.where(eq(schema.agentMemoryCanvas.id, id))
			.limit(1);

		return normalizeCanvasRow(created);
	}

	static async createCanvasRevision(
		params: CreateRevisionParams
	): Promise<AgentMemoryCanvasRevisionRecord> {
		const id = nanoid();
		const createdAt = new Date();

		await db.insert(schema.agentMemoryCanvasRevision).values({
			id,
			canvasId: params.canvasId,
			scopeType: params.scopeType,
			scopeKey: params.scopeKey,
			courseId: params.courseId,
			activityId: params.activityId,
			studentId: params.studentId,
			revision: params.revision,
			content: params.content,
			changeSummary: params.changeSummary ?? null,
			sourceEventType: 'sync_update',
			sourceChatId: params.sourceChatId ?? null,
			sourceToolCallId: params.sourceToolCallId ?? null,
			modelName: params.modelName ?? null,
			createdAt
		});

		const [created] = await db
			.select()
			.from(schema.agentMemoryCanvasRevision)
			.where(eq(schema.agentMemoryCanvasRevision.id, id))
			.limit(1);

		return normalizeRevisionRow(created);
	}

	static async createSyncEvent(
		params: CreateSyncEventParams
	): Promise<AgentMemoryCanvasSyncEventRecord> {
		const id = nanoid();
		const createdAt = new Date();

		await db.insert(schema.agentMemoryCanvasSyncEvent).values({
			id,
			canvasId: params.canvasId ?? null,
			scopeType: params.scopeType,
			scopeKey: params.scopeKey,
			courseId: params.courseId,
			activityId: params.activityId,
			studentId: params.studentId,
			chatId: params.chatId ?? null,
			toolCallId: params.toolCallId ?? null,
			modelName: params.modelName ?? null,
			status: params.status,
			changeSummary: params.changeSummary ?? null,
			errorMessage: params.errorMessage ?? null,
			createdAt
		});

		const [created] = await db
			.select()
			.from(schema.agentMemoryCanvasSyncEvent)
			.where(eq(schema.agentMemoryCanvasSyncEvent.id, id))
			.limit(1);

		return normalizeSyncEventRow(created);
	}

	static async getLatestSuccessfulSyncEvent(
		params: CanvasScopeParams & { chatId: string }
	): Promise<AgentMemoryCanvasSyncEventRecord | null> {
		const [row] = await db
			.select()
			.from(schema.agentMemoryCanvasSyncEvent)
			.where(
				and(
					eq(schema.agentMemoryCanvasSyncEvent.scopeType, params.scopeType),
					eq(schema.agentMemoryCanvasSyncEvent.scopeKey, params.scopeKey),
					eq(schema.agentMemoryCanvasSyncEvent.chatId, params.chatId),
					inArray(schema.agentMemoryCanvasSyncEvent.status, ['updated', 'unchanged'])
				)
			)
			.orderBy(desc(schema.agentMemoryCanvasSyncEvent.createdAt))
			.limit(1);

		return row ? normalizeSyncEventRow(row) : null;
	}

	static async getLatestUserMessageAt(chatId: string): Promise<Date | null> {
		const [row] = await db
			.select({ createdAt: schema.agentMessage.createdAt })
			.from(schema.agentMessage)
			.where(and(eq(schema.agentMessage.chatId, chatId), eq(schema.agentMessage.role, 'user')))
			.orderBy(desc(schema.agentMessage.createdAt))
			.limit(1);

		return row?.createdAt ?? null;
	}
}
