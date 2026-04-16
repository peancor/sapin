import { relations } from 'drizzle-orm';
import { integer, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { chat } from './chat';
import { course } from './courses';
import { interactiveLearning } from './interactive';
import { user } from './users';

export const lessonSessionPolicy = {
	RESUME_LATEST: 'resume_latest',
	ALWAYS_NEW_ATTEMPT: 'always_new_attempt'
} as const;

export type LessonSessionPolicyType =
	(typeof lessonSessionPolicy)[keyof typeof lessonSessionPolicy];

export const lessonAttemptStatus = {
	ACTIVE: 'active',
	COMPLETED: 'completed',
	RESTARTED: 'restarted',
	ABANDONED: 'abandoned'
} as const;

export type LessonAttemptStatusType =
	(typeof lessonAttemptStatus)[keyof typeof lessonAttemptStatus];

export const lessonBlockStateStatus = {
	PENDING: 'pending',
	ACTIVE: 'active',
	COMPLETED: 'completed',
	SKIPPED: 'skipped'
} as const;

export type LessonBlockStateStatusType =
	(typeof lessonBlockStateStatus)[keyof typeof lessonBlockStateStatus];

export const lessonBlockVisitStatus = {
	ACTIVE: 'active',
	COMPLETED: 'completed',
	SKIPPED: 'skipped',
	ABANDONED: 'abandoned'
} as const;

export type LessonBlockVisitStatusType =
	(typeof lessonBlockVisitStatus)[keyof typeof lessonBlockVisitStatus];

export const lessonEventType = {
	SESSION_STARTED: 'session_started',
	BLOCK_ENTERED: 'block_entered',
	BLOCK_COMPLETED: 'block_completed',
	BRANCH_TAKEN: 'branch_taken',
	SESSION_RESTARTED: 'session_restarted',
	SESSION_COMPLETED: 'session_completed'
} as const;

export type LessonEventType = (typeof lessonEventType)[keyof typeof lessonEventType];

export const interactiveLearningLesson = sqliteTable(
	'interactive_learning_lesson',
	{
		id: text('id')
			.primaryKey()
			.references(() => interactiveLearning.id, { onDelete: 'cascade' }),
		sessionPolicy: text('session_policy')
			.$type<LessonSessionPolicyType>()
			.notNull()
			.default('resume_latest'),
		allowRestart: integer('allow_restart', { mode: 'boolean' }).notNull().default(true),
		metadata: text('metadata'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [index('interactive_learning_lesson_policy_idx').on(table.sessionPolicy)]
);

export const interactiveLessonSession = sqliteTable(
	'interactive_lesson_session',
	{
		id: text('id').primaryKey(),
		interactiveLearningId: text('interactive_learning_id')
			.notNull()
			.references(() => interactiveLearningLesson.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		attemptNumber: integer('attempt_number').notNull().default(1),
		status: text('status').$type<LessonAttemptStatusType>().notNull().default('active'),
		currentBlockId: text('current_block_id').notNull(),
		currentVisitId: text('current_visit_id'),
		sessionStateJson: text('session_state_json'),
		startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
		lastActiveAt: integer('last_active_at', { mode: 'timestamp' }).notNull(),
		completedAt: integer('completed_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('interactive_lesson_session_activity_idx').on(table.interactiveLearningId),
		index('interactive_lesson_session_user_idx').on(table.userId),
		index('interactive_lesson_session_course_idx').on(table.courseId),
		index('interactive_lesson_session_current_visit_idx').on(table.currentVisitId),
		index('interactive_lesson_session_status_idx').on(table.status)
	]
);

export const interactiveLessonBlockState = sqliteTable(
	'interactive_lesson_block_state',
	{
		id: text('id').primaryKey(),
		sessionId: text('session_id')
			.notNull()
			.references(() => interactiveLessonSession.id, { onDelete: 'cascade' }),
		blockId: text('block_id').notNull(),
		status: text('status').$type<LessonBlockStateStatusType>().notNull().default('pending'),
		visitCount: integer('visit_count').notNull().default(0),
		lastVisitId: text('last_visit_id'),
		enteredAt: integer('entered_at', { mode: 'timestamp' }),
		completedAt: integer('completed_at', { mode: 'timestamp' }),
		lastChoiceValue: text('last_choice_value'),
		outputsJson: text('outputs_json'),
		chatId: text('chat_id').references(() => chat.id, { onDelete: 'set null' }),
		metadata: text('metadata'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('interactive_lesson_block_state_session_idx').on(table.sessionId),
		index('interactive_lesson_block_state_last_visit_idx').on(table.lastVisitId),
		index('interactive_lesson_block_state_chat_idx').on(table.chatId),
		uniqueIndex('interactive_lesson_block_state_session_block_idx').on(
			table.sessionId,
			table.blockId
		)
	]
);

export const interactiveLessonBlockVisit = sqliteTable(
	'interactive_lesson_block_visit',
	{
		id: text('id').primaryKey(),
		sessionId: text('session_id')
			.notNull()
			.references(() => interactiveLessonSession.id, { onDelete: 'cascade' }),
		blockId: text('block_id').notNull(),
		visitNumber: integer('visit_number').notNull(),
		status: text('status').$type<LessonBlockVisitStatusType>().notNull().default('active'),
		enteredAt: integer('entered_at', { mode: 'timestamp' }).notNull(),
		completedAt: integer('completed_at', { mode: 'timestamp' }),
		lastChoiceValue: text('last_choice_value'),
		outputsJson: text('outputs_json'),
		chatId: text('chat_id').references(() => chat.id, { onDelete: 'set null' }),
		metadata: text('metadata'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('interactive_lesson_block_visit_session_idx').on(table.sessionId),
		index('interactive_lesson_block_visit_session_block_idx').on(table.sessionId, table.blockId),
		index('interactive_lesson_block_visit_chat_idx').on(table.chatId),
		uniqueIndex('interactive_lesson_block_visit_session_visit_idx').on(
			table.sessionId,
			table.visitNumber
		)
	]
);

export const interactiveLessonEvent = sqliteTable(
	'interactive_lesson_event',
	{
		id: text('id').primaryKey(),
		interactiveLearningId: text('interactive_learning_id')
			.notNull()
			.references(() => interactiveLearning.id, { onDelete: 'cascade' }),
		sessionId: text('session_id')
			.notNull()
			.references(() => interactiveLessonSession.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		visitId: text('visit_id'),
		blockId: text('block_id'),
		eventType: text('event_type').$type<LessonEventType>().notNull(),
		payloadJson: text('payload_json'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		index('interactive_lesson_event_activity_idx').on(table.interactiveLearningId),
		index('interactive_lesson_event_session_idx').on(table.sessionId),
		index('interactive_lesson_event_visit_idx').on(table.visitId),
		index('interactive_lesson_event_user_idx').on(table.userId),
		index('interactive_lesson_event_course_idx').on(table.courseId),
		index('interactive_lesson_event_type_idx').on(table.eventType)
	]
);

export const interactiveLearningLessonRelations = relations(
	interactiveLearningLesson,
	({ one, many }) => ({
		interactiveLearning: one(interactiveLearning, {
			fields: [interactiveLearningLesson.id],
			references: [interactiveLearning.id]
		}),
		sessions: many(interactiveLessonSession)
	})
);

export const interactiveLessonSessionRelations = relations(
	interactiveLessonSession,
	({ one, many }) => ({
		lesson: one(interactiveLearningLesson, {
			fields: [interactiveLessonSession.interactiveLearningId],
			references: [interactiveLearningLesson.id]
		}),
		user: one(user, {
			fields: [interactiveLessonSession.userId],
			references: [user.id]
		}),
		course: one(course, {
			fields: [interactiveLessonSession.courseId],
			references: [course.id]
		}),
		currentVisit: one(interactiveLessonBlockVisit, {
			fields: [interactiveLessonSession.currentVisitId],
			references: [interactiveLessonBlockVisit.id]
		}),
		blockStates: many(interactiveLessonBlockState),
		blockVisits: many(interactiveLessonBlockVisit),
		events: many(interactiveLessonEvent)
	})
);

export const interactiveLessonBlockStateRelations = relations(
	interactiveLessonBlockState,
	({ one }) => ({
		session: one(interactiveLessonSession, {
			fields: [interactiveLessonBlockState.sessionId],
			references: [interactiveLessonSession.id]
		}),
		lastVisit: one(interactiveLessonBlockVisit, {
			fields: [interactiveLessonBlockState.lastVisitId],
			references: [interactiveLessonBlockVisit.id]
		}),
		chat: one(chat, {
			fields: [interactiveLessonBlockState.chatId],
			references: [chat.id]
		})
	})
);

export const interactiveLessonBlockVisitRelations = relations(
	interactiveLessonBlockVisit,
	({ one, many }) => ({
		session: one(interactiveLessonSession, {
			fields: [interactiveLessonBlockVisit.sessionId],
			references: [interactiveLessonSession.id]
		}),
		chat: one(chat, {
			fields: [interactiveLessonBlockVisit.chatId],
			references: [chat.id]
		}),
		events: many(interactiveLessonEvent)
	})
);

export const interactiveLessonEventRelations = relations(interactiveLessonEvent, ({ one }) => ({
	session: one(interactiveLessonSession, {
		fields: [interactiveLessonEvent.sessionId],
		references: [interactiveLessonSession.id]
	}),
	visit: one(interactiveLessonBlockVisit, {
		fields: [interactiveLessonEvent.visitId],
		references: [interactiveLessonBlockVisit.id]
	}),
	interactiveLearning: one(interactiveLearning, {
		fields: [interactiveLessonEvent.interactiveLearningId],
		references: [interactiveLearning.id]
	}),
	user: one(user, {
		fields: [interactiveLessonEvent.userId],
		references: [user.id]
	}),
	course: one(course, {
		fields: [interactiveLessonEvent.courseId],
		references: [course.id]
	})
}));

export const insertInteractiveLearningLessonSchema = createInsertSchema(interactiveLearningLesson, {
	sessionPolicy: z.enum(['resume_latest', 'always_new_attempt']).default('resume_latest')
});
export const selectInteractiveLearningLessonSchema = createSelectSchema(interactiveLearningLesson);

export const insertInteractiveLessonSessionSchema = createInsertSchema(interactiveLessonSession, {
	status: z.enum(['active', 'completed', 'restarted', 'abandoned']).default('active')
});
export const selectInteractiveLessonSessionSchema = createSelectSchema(interactiveLessonSession);

export const insertInteractiveLessonBlockStateSchema = createInsertSchema(
	interactiveLessonBlockState,
	{
		status: z.enum(['pending', 'active', 'completed', 'skipped']).default('pending')
	}
);
export const selectInteractiveLessonBlockStateSchema = createSelectSchema(interactiveLessonBlockState);

export const insertInteractiveLessonBlockVisitSchema = createInsertSchema(
	interactiveLessonBlockVisit,
	{
		status: z.enum(['active', 'completed', 'skipped', 'abandoned']).default('active')
	}
);
export const selectInteractiveLessonBlockVisitSchema = createSelectSchema(interactiveLessonBlockVisit);

export const insertInteractiveLessonEventSchema = createInsertSchema(interactiveLessonEvent, {
	eventType: z.enum([
		'session_started',
		'block_entered',
		'block_completed',
		'branch_taken',
		'session_restarted',
		'session_completed'
	])
});
export const selectInteractiveLessonEventSchema = createSelectSchema(interactiveLessonEvent);

export type InteractiveLearningLesson = typeof interactiveLearningLesson.$inferSelect;
export type InteractiveLessonSession = typeof interactiveLessonSession.$inferSelect;
export type InteractiveLessonBlockState = typeof interactiveLessonBlockState.$inferSelect;
export type InteractiveLessonBlockVisit = typeof interactiveLessonBlockVisit.$inferSelect;
export type InteractiveLessonEvent = typeof interactiveLessonEvent.$inferSelect;
