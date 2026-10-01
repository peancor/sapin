import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { agentToolDefinition } from './agent';
import { chat } from './chat';
import { user } from './users';

export const agentWorkspaceKind = {
	COURSE: 'course_staff',
	ACTIVITY: 'activity_staff'
} as const;

export const agentWorkspaceVisibility = {
	SHARED: 'shared',
	PRIVATE: 'private'
} as const;

export const agentThreadStatus = {
	DRAFT: 'draft',
	ACTIVE: 'active',
	PAUSED: 'paused',
	COMPLETED: 'completed'
} as const;

export const agentWorkspace = sqliteTable(
	'agent_workspace',
	{
		id: text('id').primaryKey(),
		workspaceKey: text('workspace_key').notNull(),
		featureKey: text('feature_key').notNull(),
		kind: text('kind').notNull(),
		scopeType: text('scope_type').notNull(),
		scopeId: text('scope_id').notNull(),
		visibility: text('visibility').notNull().default('shared'),
		ownerUserId: text('owner_user_id').references(() => user.id),
		llmModel: text('llm_model'),
		llmRole: text('llm_role'),
		llmInstructions: text('llm_instructions'),
		llmContext: text('llm_context'),
		systemPrompt: text('system_prompt'),
		maxToolRoundtrips: integer('max_tool_roundtrips').notNull().default(8),
		parallelToolCalls: integer('parallel_tool_calls', { mode: 'boolean' })
			.notNull()
			.default(false),
		toolChoice: text('tool_choice').notNull().default('auto'),
		metadata: text('metadata'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		uniqueIndex('agent_workspace_key_unique').on(table.workspaceKey),
		index('agent_workspace_feature_idx').on(table.featureKey),
		index('agent_workspace_kind_idx').on(table.kind),
		index('agent_workspace_scope_idx').on(table.scopeType, table.scopeId),
		index('agent_workspace_owner_idx').on(table.ownerUserId)
	]
);

export const agentWorkspaceTool = sqliteTable(
	'agent_workspace_tool',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => agentWorkspace.id, { onDelete: 'cascade' }),
		toolDefinitionId: text('tool_definition_id')
			.notNull()
			.references(() => agentToolDefinition.id, { onDelete: 'cascade' }),
		isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
		configOverride: text('config_override'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('agent_workspace_tool_workspace_idx').on(table.workspaceId),
		index('agent_workspace_tool_tool_idx').on(table.toolDefinitionId)
	]
);

export const agentThread = sqliteTable(
	'agent_thread',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => agentWorkspace.id, { onDelete: 'cascade' }),
		chatId: text('chat_id')
			.notNull()
			.references(() => chat.id, { onDelete: 'cascade' }),
		createdByUserId: text('created_by_user_id')
			.notNull()
			.references(() => user.id),
		title: text('title'),
		status: text('status').notNull().default('draft'),
		summary: text('summary'),
		lastMessageAt: integer('last_message_at', { mode: 'timestamp' }),
		deletedAt: integer('deleted_at', { mode: 'timestamp' }),
		deletedByUserId: text('deleted_by_user_id').references(() => user.id),
		metadata: text('metadata'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('agent_thread_workspace_idx').on(table.workspaceId),
		index('agent_thread_chat_idx').on(table.chatId),
		index('agent_thread_deleted_idx').on(table.deletedAt),
		index('agent_thread_updated_idx').on(table.updatedAt)
	]
);

export const agentWorkspaceRelations = relations(agentWorkspace, ({ one, many }) => ({
	ownerUser: one(user, {
		fields: [agentWorkspace.ownerUserId],
		references: [user.id]
	}),
	enabledTools: many(agentWorkspaceTool),
	threads: many(agentThread)
}));

export const agentWorkspaceToolRelations = relations(agentWorkspaceTool, ({ one }) => ({
	workspace: one(agentWorkspace, {
		fields: [agentWorkspaceTool.workspaceId],
		references: [agentWorkspace.id]
	}),
	toolDefinition: one(agentToolDefinition, {
		fields: [agentWorkspaceTool.toolDefinitionId],
		references: [agentToolDefinition.id]
	})
}));

export const agentThreadRelations = relations(agentThread, ({ one }) => ({
	workspace: one(agentWorkspace, {
		fields: [agentThread.workspaceId],
		references: [agentWorkspace.id]
	}),
	chat: one(chat, {
		fields: [agentThread.chatId],
		references: [chat.id]
	}),
	createdByUser: one(user, {
		fields: [agentThread.createdByUserId],
		references: [user.id]
	}),
	deletedByUser: one(user, {
		fields: [agentThread.deletedByUserId],
		references: [user.id]
	})
}));

export type AgentWorkspace = typeof agentWorkspace.$inferSelect;
export type NewAgentWorkspace = typeof agentWorkspace.$inferInsert;
export type AgentWorkspaceTool = typeof agentWorkspaceTool.$inferSelect;
export type NewAgentWorkspaceTool = typeof agentWorkspaceTool.$inferInsert;
export type AgentThread = typeof agentThread.$inferSelect;
export type NewAgentThread = typeof agentThread.$inferInsert;

// Legacy aliases so feature modules can migrate incrementally while the schema stays generic.
export const staffAgentWorkspaceKind = agentWorkspaceKind;
export const staffAgentWorkspaceVisibility = agentWorkspaceVisibility;
export const staffAgentThreadStatus = agentThreadStatus;
export const staffAgentWorkspace = agentWorkspace;
export const staffAgentWorkspaceTool = agentWorkspaceTool;
export const staffAgentThread = agentThread;
export const staffAgentWorkspaceRelations = agentWorkspaceRelations;
export const staffAgentWorkspaceToolRelations = agentWorkspaceToolRelations;
export const staffAgentThreadRelations = agentThreadRelations;
export type StaffAgentWorkspace = AgentWorkspace;
export type NewStaffAgentWorkspace = NewAgentWorkspace;
export type StaffAgentWorkspaceTool = AgentWorkspaceTool;
export type NewStaffAgentWorkspaceTool = NewAgentWorkspaceTool;
export type StaffAgentThread = AgentThread;
export type NewStaffAgentThread = NewAgentThread;
