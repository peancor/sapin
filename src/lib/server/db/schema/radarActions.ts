import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { course } from './courses';
import { interactiveLearning } from './interactive';
import { user } from './users';
import { radarRun } from './radar';
import type {
	RadarActionInput,
	RadarActionExecution,
	RadarActionSnapshot,
	RadarActionResult
} from '$lib/types/radarActions';

export const radarAction = sqliteTable(
	'radar_action',
	{
		id: text('id').primaryKey(),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		activityId: text('activity_id').references(() => interactiveLearning.id, {
			onDelete: 'cascade'
		}),
		definition: text('definition', { mode: 'json' }).$type<RadarActionInput>().notNull(),
		revision: integer('revision').notNull().default(1),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('radar_action_course_idx').on(t.courseId, t.activityId)]
);

export const radarActionExecution = sqliteTable(
	'radar_action_execution',
	{
		id: text('id').primaryKey(),
		runId: text('run_id')
			.notNull()
			.references(() => radarRun.id, { onDelete: 'cascade' }),
		actionId: text('action_id').references(() => radarAction.id, { onDelete: 'set null' }),
		actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
		requestId: text('request_id').notNull(),
		action: text('action', { mode: 'json' })
			.$type<RadarActionInput & { revision: number }>()
			.notNull(),
		modelId: text('model_id').notNull(),
		state: text('state').$type<RadarActionExecution['state']>().notNull(),
		snapshot: text('snapshot', { mode: 'json' }).$type<RadarActionSnapshot>(),
		result: text('result', { mode: 'json' }).$type<RadarActionResult>(),
		error: text('error'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
		leaseUntil: integer('lease_until', { mode: 'timestamp_ms' })
	},
	(t) => [
		index('radar_action_execution_history_idx').on(t.runId, t.createdAt),
		index('radar_action_execution_work_idx').on(t.state, t.createdAt),
		uniqueIndex('radar_action_request_idx').on(t.runId, t.actorId, t.requestId),
		uniqueIndex('radar_action_active_idx')
			.on(t.runId, t.actionId, t.actorId)
			.where(sql`${t.state} IN ('queued', 'processing')`)
	]
);
