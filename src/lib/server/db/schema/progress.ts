import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { user } from './users';
import { course } from './courses';
import { interactiveLearning } from './interactive';

export const learningActivityStatus = {
    NOT_STARTED: 'not_started',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    ABANDONED: 'abandoned'
} as const;

export type LearningActivityStatusType =
    (typeof learningActivityStatus)[keyof typeof learningActivityStatus];

export const learningActivityProgress = sqliteTable(
    'learning_activity_progress',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id),
        courseId: text('course_id')
            .notNull()
            .references(() => course.id),
        activityId: text('activity_id')
            .notNull()
            .references(() => interactiveLearning.id),
        activityType: text('activity_type').notNull().default('chat'),
        status: text('status')
            .notNull()
            .$type<LearningActivityStatusType>()
            .default(learningActivityStatus.NOT_STARTED),

        startedAt: integer('started_at', { mode: 'timestamp' }),
        lastInteractionAt: integer('last_interaction_at', { mode: 'timestamp' }).notNull(),
        completedAt: integer('completed_at', { mode: 'timestamp' }),

        attemptsCount: integer('attempts_count').notNull().default(0),
        timeSpentSeconds: integer('time_spent_seconds').notNull().default(0),

        scoreRaw: integer('score_raw'),
        scoreNormalized: integer('score_normalized'),
        masteryLevel: integer('mastery_level'),

        metadataJson: text('metadata_json'),
        version: integer('version').notNull().default(1),

        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('learning_activity_progress_userId_idx').on(table.userId),
        index('learning_activity_progress_courseId_idx').on(table.courseId),
        index('learning_activity_progress_activityId_idx').on(table.activityId),
        index('learning_activity_progress_status_idx').on(table.status)
    ]
);

export const learningProgressEvent = sqliteTable(
    'learning_progress_event',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id),
        courseId: text('course_id')
            .notNull()
            .references(() => course.id),
        activityId: text('activity_id')
            .notNull()
            .references(() => interactiveLearning.id),
        eventType: text('event_type').notNull(),
        eventAt: integer('event_at', { mode: 'timestamp' }).notNull(),
        source: text('source').notNull().default('system'),
        payloadJson: text('payload_json'),
        correlationId: text('correlation_id'),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('learning_progress_event_userId_idx').on(table.userId),
        index('learning_progress_event_courseId_idx').on(table.courseId),
        index('learning_progress_event_activityId_idx').on(table.activityId),
        index('learning_progress_event_eventType_idx').on(table.eventType),
        index('learning_progress_event_eventAt_idx').on(table.eventAt)
    ]
);

export const courseProgressSummary = sqliteTable(
    'course_progress_summary',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id),
        courseId: text('course_id')
            .notNull()
            .references(() => course.id),

        completedActivities: integer('completed_activities').notNull().default(0),
        inProgressActivities: integer('in_progress_activities').notNull().default(0),
        completionRate: integer('completion_rate').notNull().default(0),
        totalTimeSpentSeconds: integer('total_time_spent_seconds').notNull().default(0),
        lastActivityAt: integer('last_activity_at', { mode: 'timestamp' }),
        metadataJson: text('metadata_json'),

        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('course_progress_summary_userId_idx').on(table.userId),
        index('course_progress_summary_courseId_idx').on(table.courseId)
    ]
);

export type LearningActivityProgress = typeof learningActivityProgress.$inferSelect;
export type LearningProgressEvent = typeof learningProgressEvent.$inferSelect;
export type CourseProgressSummary = typeof courseProgressSummary.$inferSelect;
