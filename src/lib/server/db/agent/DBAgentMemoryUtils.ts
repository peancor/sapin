import { and, desc, eq, gte, gt, inArray, isNull, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '..';
import * as schema from '../schema';
import type {
	AgentMemoryAccessEvent,
	AgentMemoryRecord,
	MemoryAccessOperation,
	MemoryAccessOutcome,
	MemoryPrivacyClass,
	MemoryScopeType,
	MemorySourceKind,
	MemoryStatus
} from '$lib/types/agentMemory';

type QueryScopeParams = {
	scopeType: MemoryScopeType;
	scopeKey: string;
	privacyClass: MemoryPrivacyClass;
	memoryTypes?: string[];
	minImportance?: number;
	since?: Date;
	limit: number;
	tagsAny?: string[];
	includeRejected?: boolean;
};

type SaveMemoryParams = {
	scopeType: MemoryScopeType;
	scopeKey: string;
	privacyClass: MemoryPrivacyClass;
	courseId: string | null;
	activityId: string | null;
	subjectUserId: string | null;
	createdByUserId: string | null;
	sourceKind: MemorySourceKind;
	memoryType: string;
	status: MemoryStatus;
	importance: number;
	dedupeKey?: string | null;
	summary: string;
	tags?: string[];
	payload: unknown;
	occurredAt?: Date | null;
	expiresAt?: Date | null;
};

function normalizeMemoryRow(row: typeof schema.agentMemory.$inferSelect): AgentMemoryRecord {
	return {
		id: row.id,
		scopeType: row.scopeType,
		scopeKey: row.scopeKey,
		privacyClass: row.privacyClass,
		courseId: row.courseId ?? null,
		activityId: row.activityId ?? null,
		subjectUserId: row.subjectUserId ?? null,
		createdByUserId: row.createdByUserId ?? null,
		sourceKind: row.sourceKind,
		memoryType: row.memoryType,
		status: row.status,
		importance: row.importance,
		dedupeKey: row.dedupeKey ?? null,
		summary: row.summary,
		tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [],
		payload: row.payload,
		occurredAt: row.occurredAt ?? null,
		expiresAt: row.expiresAt ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function matchesTags(rowTags: string[], tagsAny?: string[]): boolean {
	if (!tagsAny?.length) return true;
	if (!rowTags.length) return false;

	const normalized = new Set(rowTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
	return tagsAny.some((tag) => normalized.has(tag.trim().toLowerCase()));
}

export default class DBAgentMemoryUtils {
	static async queryMemoriesByScope(params: QueryScopeParams): Promise<AgentMemoryRecord[]> {
		const now = new Date();
		const fetchLimit = params.tagsAny?.length ? Math.max(params.limit * 4, 20) : params.limit;
		const filters = [
			eq(schema.agentMemory.scopeType, params.scopeType),
			eq(schema.agentMemory.scopeKey, params.scopeKey),
			eq(schema.agentMemory.privacyClass, params.privacyClass),
			or(isNull(schema.agentMemory.expiresAt), gt(schema.agentMemory.expiresAt, now))
		];

		if (!params.includeRejected) {
			filters.push(eq(schema.agentMemory.status, 'active'));
		}

		if (params.memoryTypes?.length) {
			filters.push(inArray(schema.agentMemory.memoryType, params.memoryTypes));
		}

		if (typeof params.minImportance === 'number') {
			filters.push(gte(schema.agentMemory.importance, params.minImportance));
		}

		if (params.since) {
			filters.push(
				or(
					gte(schema.agentMemory.occurredAt, params.since),
					and(isNull(schema.agentMemory.occurredAt), gte(schema.agentMemory.createdAt, params.since))
				)
			);
		}

		const rows = await db
			.select()
			.from(schema.agentMemory)
			.where(and(...filters))
			.orderBy(
				desc(schema.agentMemory.importance),
				desc(schema.agentMemory.occurredAt),
				desc(schema.agentMemory.createdAt)
			)
			.limit(fetchLimit);

		return rows
			.map(normalizeMemoryRow)
			.filter((row) => matchesTags(row.tags, params.tagsAny))
			.slice(0, params.limit);
	}

	static async saveMemory(params: SaveMemoryParams): Promise<AgentMemoryRecord> {
		const now = new Date();

		if (params.dedupeKey) {
			const existing = await db
				.select()
				.from(schema.agentMemory)
				.where(
					and(
						eq(schema.agentMemory.scopeKey, params.scopeKey),
						eq(schema.agentMemory.memoryType, params.memoryType),
						eq(schema.agentMemory.dedupeKey, params.dedupeKey)
					)
				)
				.limit(1);

			if (existing[0]) {
				await db
					.update(schema.agentMemory)
					.set({
						privacyClass: params.privacyClass,
						courseId: params.courseId,
						activityId: params.activityId,
						subjectUserId: params.subjectUserId,
						createdByUserId: params.createdByUserId,
						sourceKind: params.sourceKind,
						status: params.status,
						importance: params.importance,
						summary: params.summary,
						tags: params.tags ?? [],
						payload: params.payload,
						occurredAt: params.occurredAt ?? null,
						expiresAt: params.expiresAt ?? null,
						updatedAt: now
					})
					.where(eq(schema.agentMemory.id, existing[0].id));

				const [updated] = await db
					.select()
					.from(schema.agentMemory)
					.where(eq(schema.agentMemory.id, existing[0].id))
					.limit(1);

				return normalizeMemoryRow(updated);
			}
		}

		const id = nanoid();
		await db.insert(schema.agentMemory).values({
			id,
			scopeType: params.scopeType,
			scopeKey: params.scopeKey,
			privacyClass: params.privacyClass,
			courseId: params.courseId,
			activityId: params.activityId,
			subjectUserId: params.subjectUserId,
			createdByUserId: params.createdByUserId,
			sourceKind: params.sourceKind,
			memoryType: params.memoryType,
			status: params.status,
			importance: params.importance,
			dedupeKey: params.dedupeKey ?? null,
			summary: params.summary,
			tags: params.tags ?? [],
			payload: params.payload,
			occurredAt: params.occurredAt ?? null,
			expiresAt: params.expiresAt ?? null,
			createdAt: now,
			updatedAt: now
		});

		const [created] = await db.select().from(schema.agentMemory).where(eq(schema.agentMemory.id, id)).limit(1);
		return normalizeMemoryRow(created);
	}

	static async logAccessEvent(data: {
		memoryId?: string | null;
		actorUserId?: string | null;
		toolName: string;
		operation: MemoryAccessOperation;
		outcome: MemoryAccessOutcome;
		scopeKey: string;
		resultCount?: number;
		details?: Record<string, unknown> | null;
	}): Promise<AgentMemoryAccessEvent> {
		const id = nanoid();
		const createdAt = new Date();
		await db.insert(schema.agentMemoryAccessEvent).values({
			id,
			memoryId: data.memoryId ?? null,
			actorUserId: data.actorUserId ?? null,
			toolName: data.toolName,
			operation: data.operation,
			outcome: data.outcome,
			scopeKey: data.scopeKey,
			resultCount: data.resultCount ?? 0,
			details: data.details ?? null,
			createdAt
		});

		return {
			id,
			memoryId: data.memoryId ?? null,
			actorUserId: data.actorUserId ?? null,
			toolName: data.toolName,
			operation: data.operation,
			outcome: data.outcome,
			scopeKey: data.scopeKey,
			resultCount: data.resultCount ?? 0,
			details: data.details ?? null,
			createdAt
		};
	}
}
