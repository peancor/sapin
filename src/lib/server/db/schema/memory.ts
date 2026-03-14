import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { chat } from './chat';
import { course } from './courses';
import { interactiveLearning } from './interactive';
import { user } from './users';
import type { MemoryCanvasScopeType, MemoryCanvasSyncStatus } from '$lib/types/agentMemory';

export const agentMemoryCanvas = sqliteTable(
	'agent_memory_canvas',
	{
		id: text('id').primaryKey(),
		scopeType: text('scope_type').$type<MemoryCanvasScopeType>().notNull(),
		scopeKey: text('scope_key').notNull(),
		courseId: text('course_id').references(() => course.id, { onDelete: 'set null' }),
		activityId: text('activity_id').references(() => interactiveLearning.id, { onDelete: 'set null' }),
		studentId: text('student_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		content: text('content').notNull(),
		revision: integer('revision').notNull().default(1),
		lastSourceChatId: text('last_source_chat_id').references(() => chat.id, { onDelete: 'set null' }),
		lastSourceToolCallId: text('last_source_tool_call_id'),
		lastModelName: text('last_model_name'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		uniqueIndex('agent_memory_canvas_scope_key_idx').on(table.scopeKey),
		index('agent_memory_canvas_student_idx').on(table.studentId, table.updatedAt),
		index('agent_memory_canvas_scope_type_idx').on(table.scopeType, table.updatedAt)
	]
);

export const agentMemoryCanvasRevision = sqliteTable(
	'agent_memory_canvas_revision',
	{
		id: text('id').primaryKey(),
		canvasId: text('canvas_id')
			.notNull()
			.references(() => agentMemoryCanvas.id, { onDelete: 'cascade' }),
		scopeType: text('scope_type').$type<MemoryCanvasScopeType>().notNull(),
		scopeKey: text('scope_key').notNull(),
		courseId: text('course_id').references(() => course.id, { onDelete: 'set null' }),
		activityId: text('activity_id').references(() => interactiveLearning.id, { onDelete: 'set null' }),
		studentId: text('student_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		revision: integer('revision').notNull(),
		content: text('content').notNull(),
		changeSummary: text('change_summary'),
		sourceEventType: text('source_event_type').notNull().default('sync_update'),
		sourceChatId: text('source_chat_id').references(() => chat.id, { onDelete: 'set null' }),
		sourceToolCallId: text('source_tool_call_id'),
		modelName: text('model_name'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		uniqueIndex('agent_memory_canvas_revision_canvas_revision_idx').on(table.canvasId, table.revision),
		index('agent_memory_canvas_revision_scope_idx').on(table.scopeKey, table.createdAt),
		index('agent_memory_canvas_revision_student_idx').on(table.studentId, table.createdAt)
	]
);

export const agentMemoryCanvasSyncEvent = sqliteTable(
	'agent_memory_canvas_sync_event',
	{
		id: text('id').primaryKey(),
		canvasId: text('canvas_id').references(() => agentMemoryCanvas.id, { onDelete: 'set null' }),
		scopeType: text('scope_type').$type<MemoryCanvasScopeType>().notNull(),
		scopeKey: text('scope_key').notNull(),
		courseId: text('course_id').references(() => course.id, { onDelete: 'set null' }),
		activityId: text('activity_id').references(() => interactiveLearning.id, { onDelete: 'set null' }),
		studentId: text('student_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		chatId: text('chat_id').references(() => chat.id, { onDelete: 'set null' }),
		toolCallId: text('tool_call_id'),
		modelName: text('model_name'),
		status: text('status').$type<MemoryCanvasSyncStatus>().notNull(),
		changeSummary: text('change_summary'),
		errorMessage: text('error_message'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('agent_memory_canvas_sync_scope_idx').on(table.scopeKey, table.chatId, table.createdAt),
		index('agent_memory_canvas_sync_status_idx').on(table.status, table.createdAt),
		index('agent_memory_canvas_sync_student_idx').on(table.studentId, table.createdAt)
	]
);

export type AgentMemoryCanvas = typeof agentMemoryCanvas.$inferSelect;
export type NewAgentMemoryCanvas = typeof agentMemoryCanvas.$inferInsert;
export type AgentMemoryCanvasRevision = typeof agentMemoryCanvasRevision.$inferSelect;
export type NewAgentMemoryCanvasRevision = typeof agentMemoryCanvasRevision.$inferInsert;
export type AgentMemoryCanvasSyncEvent = typeof agentMemoryCanvasSyncEvent.$inferSelect;
export type NewAgentMemoryCanvasSyncEvent = typeof agentMemoryCanvasSyncEvent.$inferInsert;
