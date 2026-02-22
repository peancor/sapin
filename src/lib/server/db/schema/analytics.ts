import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { user } from './users';

// ============================================
// SISTEMA DE ANALÍTICA
// ============================================

export const analyticsEventType = {
    PAGE_VIEW: 'page_view',
    PAGE_EXIT: 'page_exit',
    SESSION_START: 'session_start',
    SESSION_END: 'session_end',
    COURSE_VIEW: 'course_view',
    ACTIVITY_START: 'activity_start',
    ACTIVITY_COMPLETE: 'activity_complete',
    CHAT_MESSAGE: 'chat_message',
    ERROR: 'error'
} as const;

export const analyticsSession = sqliteTable(
    'analytics_session',
    {
        id: text('id').primaryKey(),
        visitorId: text('visitor_id').notNull(), // UUID anónimo en localStorage
        userId: text('user_id').references(() => user.id, { onDelete: 'set null' }), // null si no autenticado
        startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
        endedAt: integer('ended_at', { mode: 'timestamp' }),
        duration: integer('duration'), // segundos
        pageViews: integer('page_views').default(0).notNull(),
        device: text('device'), // desktop/mobile/tablet
        browser: text('browser'),
        os: text('os'),
        screenResolution: text('screen_resolution'),
        language: text('language'),
        referrer: text('referrer'),
        utmSource: text('utm_source'),
        utmMedium: text('utm_medium'),
        utmCampaign: text('utm_campaign'),
        country: text('country'),
        isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull()
    },
    (table) => [
        index('analytics_session_visitorId_idx').on(table.visitorId),
        index('analytics_session_userId_idx').on(table.userId),
        index('analytics_session_startedAt_idx').on(table.startedAt),
        index('analytics_session_isActive_idx').on(table.isActive)
    ]
);

export const analyticsEvent = sqliteTable(
    'analytics_event',
    {
        id: text('id').primaryKey(),
        sessionId: text('session_id').references(() => analyticsSession.id, { onDelete: 'cascade' }),
        visitorId: text('visitor_id').notNull(),
        userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
        type: text('type')
            .notNull()
            .$type<(typeof analyticsEventType)[keyof typeof analyticsEventType]>(),
        name: text('name').notNull(), // Nombre descriptivo del evento
        path: text('path'), // URL path
        title: text('title'), // Título de la página
        referrer: text('referrer'),
        duration: integer('duration'), // Tiempo en página (para page_view)
        metadata: text('metadata'), // JSON con datos adicionales
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('analytics_event_sessionId_idx').on(table.sessionId),
        index('analytics_event_visitorId_idx').on(table.visitorId),
        index('analytics_event_userId_idx').on(table.userId),
        index('analytics_event_type_idx').on(table.type),
        index('analytics_event_createdAt_idx').on(table.createdAt),
        index('analytics_event_path_idx').on(table.path)
    ]
);

export const analyticsDailyStats = sqliteTable(
    'analytics_daily_stats',
    {
        id: text('id').primaryKey(),
        date: text('date').notNull().unique(), // YYYY-MM-DD
        uniqueVisitors: integer('unique_visitors').default(0).notNull(),
        uniqueUsers: integer('unique_users').default(0).notNull(), // Usuarios autenticados
        totalSessions: integer('total_sessions').default(0).notNull(),
        totalPageViews: integer('total_page_views').default(0).notNull(),
        avgSessionDuration: integer('avg_session_duration').default(0).notNull(), // segundos
        bounceRate: real('bounce_rate').default(0).notNull(), // porcentaje 0-100
        topPages: text('top_pages'), // JSON array [{path, views}]
        topReferrers: text('top_referrers'), // JSON array [{referrer, count}]
        deviceBreakdown: text('device_breakdown'), // JSON {desktop, mobile, tablet}
        browserBreakdown: text('browser_breakdown'), // JSON {chrome, firefox, safari, ...}
        newVsReturning: text('new_vs_returning'), // JSON {new, returning}
        hourlyActivity: text('hourly_activity'), // JSON array [0-23] con conteos
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [index('analytics_daily_stats_date_idx').on(table.date)]
);

export type AnalyticsSession = typeof analyticsSession.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvent.$inferSelect;
export type AnalyticsDailyStats = typeof analyticsDailyStats.$inferSelect;
