import { relations } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { chat } from './chat';
import { interactiveLearning } from './interactive';
import { agentToolDefinition } from './agent';
import { user } from './users';

export const interactiveLearningInsightsAgent = sqliteTable(
	'interactive_learning_insights_agent',
	{
		id: text('id')
			.primaryKey()
			.references(() => interactiveLearning.id, { onDelete: 'cascade' }),
		llmRole: text('llm_role'),
		llmInstructions: text('llm_instructions'),
		llmContext: text('llm_context'),
		systemPrompt: text('system_prompt'),
		llmModel: text('llm_model'),
		temperature: real('temperature'),
		maxTokens: integer('max_tokens'),
		topP: real('top_p'),
		maxToolRoundtrips: integer('max_tool_roundtrips').notNull().default(8),
		parallelToolCalls: integer('parallel_tool_calls', { mode: 'boolean' })
			.notNull()
			.default(false),
		toolChoice: text('tool_choice').notNull().default('auto'),
		metadata: text('metadata'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [index('interactive_learning_insights_agent_model_idx').on(table.llmModel)]
);

export const insightsAgentActivityTool = sqliteTable(
	'insights_agent_activity_tool',
	{
		id: text('id').primaryKey(),
		insightsAgentId: text('insights_agent_id')
			.notNull()
			.references(() => interactiveLearningInsightsAgent.id, { onDelete: 'cascade' }),
		toolDefinitionId: text('tool_definition_id')
			.notNull()
			.references(() => agentToolDefinition.id, { onDelete: 'cascade' }),
		configOverride: text('config_override'),
		isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('insights_agent_activity_tool_agent_idx').on(table.insightsAgentId),
		index('insights_agent_activity_tool_def_idx').on(table.toolDefinitionId)
	]
);

export const insightsAgentRun = sqliteTable(
	'insights_agent_run',
	{
		id: text('id').primaryKey(),
		interactiveLearningId: text('interactive_learning_id')
			.notNull()
			.references(() => interactiveLearning.id, { onDelete: 'cascade' }),
		chatId: text('chat_id')
			.notNull()
			.references(() => chat.id, { onDelete: 'cascade' }),
		createdByUserId: text('created_by_user_id')
			.notNull()
			.references(() => user.id),
		title: text('title'),
		status: text('status').notNull().default('draft'),
		summary: text('summary'),
		scope: text('scope').notNull(),
		metadata: text('metadata'),
		lastMessageAt: integer('last_message_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('insights_agent_run_interactive_idx').on(table.interactiveLearningId),
		index('insights_agent_run_creator_idx').on(table.createdByUserId),
		index('insights_agent_run_chat_idx').on(table.chatId),
		index('insights_agent_run_status_idx').on(table.status)
	]
);

export const interactiveLearningInsightsAgentRelations = relations(
	interactiveLearningInsightsAgent,
	({ one, many }) => ({
		interactiveLearning: one(interactiveLearning, {
			fields: [interactiveLearningInsightsAgent.id],
			references: [interactiveLearning.id]
		}),
		activityTools: many(insightsAgentActivityTool)
	})
);

export const insightsAgentActivityToolRelations = relations(
	insightsAgentActivityTool,
	({ one }) => ({
		insightsAgent: one(interactiveLearningInsightsAgent, {
			fields: [insightsAgentActivityTool.insightsAgentId],
			references: [interactiveLearningInsightsAgent.id]
		}),
		toolDefinition: one(agentToolDefinition, {
			fields: [insightsAgentActivityTool.toolDefinitionId],
			references: [agentToolDefinition.id]
		})
	})
);

export const insightsAgentRunRelations = relations(insightsAgentRun, ({ one }) => ({
	interactiveLearning: one(interactiveLearning, {
		fields: [insightsAgentRun.interactiveLearningId],
		references: [interactiveLearning.id]
	}),
	chat: one(chat, {
		fields: [insightsAgentRun.chatId],
		references: [chat.id]
	}),
	createdByUser: one(user, {
		fields: [insightsAgentRun.createdByUserId],
		references: [user.id]
	})
}));

export type InteractiveLearningInsightsAgent =
	typeof interactiveLearningInsightsAgent.$inferSelect;
export type NewInteractiveLearningInsightsAgent =
	typeof interactiveLearningInsightsAgent.$inferInsert;
export type InsightsAgentActivityTool = typeof insightsAgentActivityTool.$inferSelect;
export type NewInsightsAgentActivityTool = typeof insightsAgentActivityTool.$inferInsert;
export type InsightsAgentRun = typeof insightsAgentRun.$inferSelect;
export type NewInsightsAgentRun = typeof insightsAgentRun.$inferInsert;
