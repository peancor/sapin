import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { course } from './courses';
import { interactiveLearning } from './interactive';
import { user } from './users';
import type {
	MemoryAccessOperation,
	MemoryAccessOutcome,
	MemoryPrivacyClass,
	MemoryScopeType,
	MemorySourceKind,
	MemoryStatus
} from '$lib/types/agentMemory';

export const agentMemory = sqliteTable(
	'agent_memory',
	{
		id: text('id').primaryKey(),
		scopeType: text('scope_type').$type<MemoryScopeType>().notNull(),
		scopeKey: text('scope_key').notNull(),
		privacyClass: text('privacy_class').$type<MemoryPrivacyClass>().notNull(),
		courseId: text('course_id').references(() => course.id, { onDelete: 'set null' }),
		activityId: text('activity_id').references(() => interactiveLearning.id, { onDelete: 'set null' }),
		subjectUserId: text('subject_user_id').references(() => user.id, { onDelete: 'set null' }),
		createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
		sourceKind: text('source_kind').$type<MemorySourceKind>().notNull(),
		memoryType: text('memory_type').notNull(),
		status: text('status').$type<MemoryStatus>().notNull().default('active'),
		importance: integer('importance').notNull().default(3),
		dedupeKey: text('dedupe_key'),
		summary: text('summary').notNull(),
		tags: text('tags', { mode: 'json' }).$type<string[]>(),
		payload: text('payload', { mode: 'json' }).$type<unknown>().notNull(),
		occurredAt: integer('occurred_at', { mode: 'timestamp' }),
		expiresAt: integer('expires_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('agent_memory_scope_idx').on(table.scopeType, table.scopeKey, table.status, table.createdAt),
		index('agent_memory_subject_idx').on(
			table.subjectUserId,
			table.courseId,
			table.activityId,
			table.createdAt
		),
		index('agent_memory_type_idx').on(table.memoryType, table.createdAt),
		uniqueIndex('agent_memory_scope_dedupe_idx').on(
			table.scopeKey,
			table.memoryType,
			table.dedupeKey
		)
	]
);

export const agentMemoryAccessEvent = sqliteTable(
	'agent_memory_access_event',
	{
		id: text('id').primaryKey(),
		memoryId: text('memory_id').references(() => agentMemory.id, { onDelete: 'cascade' }),
		actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
		toolName: text('tool_name').notNull(),
		operation: text('operation').$type<MemoryAccessOperation>().notNull(),
		outcome: text('outcome').$type<MemoryAccessOutcome>().notNull(),
		scopeKey: text('scope_key').notNull(),
		resultCount: integer('result_count').notNull().default(0),
		details: text('details', { mode: 'json' }).$type<Record<string, unknown>>(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('agent_memory_access_scope_idx').on(table.scopeKey, table.createdAt),
		index('agent_memory_access_actor_idx').on(table.actorUserId, table.createdAt),
		index('agent_memory_access_tool_idx').on(table.toolName, table.createdAt)
	]
);

export type AgentMemory = typeof agentMemory.$inferSelect;
export type NewAgentMemory = typeof agentMemory.$inferInsert;
export type AgentMemoryAccessEventRow = typeof agentMemoryAccessEvent.$inferSelect;
