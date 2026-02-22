import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { user } from './users';
import { course } from './courses';
import { interactiveLearning } from './interactive';

// ============================================
// SISTEMA DE NOTIFICACIONES
// ============================================

export const notificationType = {
    ACTIVITY_COMPLETED: 'activity_completed',
    ENROLLMENT: 'enrollment',
    NEW_ACTIVITY: 'new_activity',
    COURSE_UPDATE: 'course_update',
    CONTACT_FORM: 'contact_form',
    SYSTEM: 'system',
    CUSTOM: 'custom'
} as const;

export const notificationPriority = {
    LOW: 'low',
    NORMAL: 'normal',
    HIGH: 'high',
    URGENT: 'urgent'
} as const;

export const notification = sqliteTable(
    'notification',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        type: text('type')
            .notNull()
            .$type<(typeof notificationType)[keyof typeof notificationType]>(),
        title: text('title').notNull(),
        message: text('message').notNull(),
        priority: text('priority')
            .notNull()
            .$type<(typeof notificationPriority)[keyof typeof notificationPriority]>()
            .default('normal'),
        courseId: text('course_id').references(() => course.id, { onDelete: 'set null' }),
        activityId: text('activity_id').references(() => interactiveLearning.id, {
            onDelete: 'set null'
        }),
        metadata: text('metadata'), // JSON
        read: integer('read', { mode: 'boolean' }).default(false).notNull(),
        readAt: integer('read_at', { mode: 'timestamp' }),
        channels: text('channels').notNull(), // JSON array ['in_app', 'email']
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        expiresAt: integer('expires_at', { mode: 'timestamp' })
    },
    (table) => [
        index('notification_userId_idx').on(table.userId),
        index('notification_read_idx').on(table.userId, table.read),
        index('notification_createdAt_idx').on(table.createdAt)
    ]
);

export type Notification = typeof notification.$inferSelect;
