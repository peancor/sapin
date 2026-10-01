import { sql } from 'drizzle-orm';
import {
	sqliteTable,
	text,
	integer,
	index,
	uniqueIndex,
	primaryKey,
	foreignKey,
	check
} from 'drizzle-orm/sqlite-core';
import { course } from './courses';
import { user } from './users';
import { interactiveLearning, courseInteractiveLearning } from './interactive';
import { message, chat } from './chat';
import { agentMessage } from './agent';
import type { RadarAnalysisState, RadarIntent, RadarRunState } from '$lib/types/radar';

export const radarRun = sqliteTable(
	'radar_run',
	{
		id: text('id').primaryKey(),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		activityId: text('activity_id')
			.notNull()
			.references(() => interactiveLearning.id, { onDelete: 'cascade' }),
		courseActivityId: text('course_activity_id')
			.notNull()
			.references(() => courseInteractiveLearning.id, { onDelete: 'cascade' }),
		creatorId: text('creator_id').references(() => user.id, { onDelete: 'set null' }),
		title: text('title').notNull(),
		activityType: text('activity_type').$type<'chat' | 'agent'>().notNull(),
		modelId: text('model_id').notNull(),
		modelName: text('model_name').notNull(),
		context: text('context'),
		startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
		endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),
		state: text('state').$type<RadarRunState>().notNull().default('active'),
		analysisState: text('analysis_state').$type<RadarAnalysisState>().notNull().default('pending'),
		nextAnalysisAt: integer('next_analysis_at', { mode: 'timestamp_ms' }).notNull(),
		leaseOwner: text('lease_owner'),
		leaseUntil: integer('lease_until', { mode: 'timestamp_ms' }),
		summary: text('summary'),
		error: text('error'),
		analyzedAt: integer('analyzed_at', { mode: 'timestamp_ms' }),
		publishedVersion: integer('published_version').notNull().default(0),
		publishedObservationCount: integer('published_observation_count').notNull().default(0),
		// Incremented by deletions, fencing results whose input no longer exists.
		evidenceVersion: integer('evidence_version').notNull().default(0),
		synthesisPending: integer('synthesis_pending', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [
		uniqueIndex('radar_one_active_idx')
			.on(t.courseId, t.activityId)
			.where(sql`${t.state} = 'active'`),
		index('radar_history_idx').on(t.courseId, t.activityId, t.startsAt),
		index('radar_work_idx').on(t.state, t.nextAnalysisAt, t.leaseUntil),
		check('radar_interval_check', sql`${t.endsAt} >= ${t.startsAt}`)
	]
);

export const radarObservation = sqliteTable(
	'radar_observation',
	{
		id: text('id').primaryKey(),
		runId: text('run_id')
			.notNull()
			.references(() => radarRun.id, { onDelete: 'cascade' }),
		messageId: text('message_id').references(() => message.id, { onDelete: 'cascade' }),
		agentMessageId: text('agent_message_id').references(() => agentMessage.id, {
			onDelete: 'cascade'
		}),
		chatId: text('chat_id')
			.notNull()
			.references(() => chat.id, { onDelete: 'cascade' }),
		studentId: text('student_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		at: integer('at', { mode: 'timestamp_ms' }).notNull(),
		status: text('status').$type<'pending' | 'processed' | 'not_analyzable'>().notNull(),
		intent: text('intent').$type<RadarIntent>(),
		confusion: text('confusion'),
		evidenceIds: text('evidence_ids', { mode: 'json' }).$type<string[]>(),
		insufficientContext: integer('insufficient_context', { mode: 'boolean' })
			.notNull()
			.default(false),
		truncated: integer('truncated', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [
		uniqueIndex('radar_observation_message_idx').on(t.runId, t.messageId),
		uniqueIndex('radar_observation_agent_idx').on(t.runId, t.agentMessageId),
		uniqueIndex('radar_observation_scope_idx').on(t.runId, t.id),
		index('radar_observation_time_idx').on(t.runId, t.at),
		index('radar_observation_student_idx').on(t.runId, t.studentId),
		index('radar_observation_pending_idx').on(t.runId, t.status, t.at),
		check(
			'radar_observation_source_check',
			sql`(${t.messageId} IS NULL) != (${t.agentMessageId} IS NULL)`
		)
	]
);

export const radarTopic = sqliteTable(
	'radar_topic',
	{
		id: text('id').primaryKey(),
		runId: text('run_id')
			.notNull()
			.references(() => radarRun.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		normalizedTitle: text('normalized_title').notNull(),
		description: text('description').notNull(),
		suggestion: text('suggestion'),
		suggestionEvidence: text('suggestion_evidence', { mode: 'json' }).$type<string[]>(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [
		uniqueIndex('radar_topic_title_idx').on(t.runId, t.normalizedTitle),
		uniqueIndex('radar_topic_scope_idx').on(t.runId, t.id)
	]
);

export const radarObservationTopic = sqliteTable(
	'radar_observation_topic',
	{
		runId: text('run_id').notNull(),
		observationId: text('observation_id').notNull(),
		topicId: text('topic_id').notNull()
	},
	(t) => [
		primaryKey({ columns: [t.observationId, t.topicId] }),
		foreignKey({
			columns: [t.runId, t.observationId],
			foreignColumns: [radarObservation.runId, radarObservation.id]
		}).onDelete('cascade'),
		foreignKey({
			columns: [t.runId, t.topicId],
			foreignColumns: [radarTopic.runId, radarTopic.id]
		}).onDelete('cascade'),
		index('radar_topic_evidence_idx').on(t.runId, t.topicId)
	]
);

export const radarAnalysis = sqliteTable(
	'radar_analysis',
	{
		id: text('id').primaryKey(),
		runId: text('run_id')
			.notNull()
			.references(() => radarRun.id, { onDelete: 'cascade' }),
		owner: text('owner').notNull(),
		modelId: text('model_id').notNull(),
		analyzerVersion: text('analyzer_version').notNull(),
		state: text('state')
			.$type<'processing' | 'success' | 'partial' | 'error' | 'abandoned'>()
			.notNull(),
		startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
		finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
		processed: integer('processed').notNull().default(0),
		batches: integer('batches').notNull().default(0),
		coverage: text('coverage', { mode: 'json' }).$type<{
			processed: number;
			pending: number;
			notAnalyzable: number;
			truncated: number;
		}>(),
		summary: text('summary'),
		error: text('error')
	},
	(t) => [index('radar_analysis_run_idx').on(t.runId, t.startedAt)]
);
