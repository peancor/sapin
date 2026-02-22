import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { user } from './users';

// ============================================
// SISTEMA DE LOGS DE AUDITORÍA
// ============================================

export const auditAction = {
    // Usuario
    USER_CREATED: 'user_created',
    USER_UPDATED: 'user_updated',
    USER_DELETED: 'user_deleted',
    USER_LOGIN: 'user_login',
    USER_LOGOUT: 'user_logout',
    USER_LOGIN_FAILED: 'user_login_failed',
    // Cursos
    COURSE_CREATED: 'course_created',
    COURSE_UPDATED: 'course_updated',
    COURSE_DELETED: 'course_deleted',
    // Actividades (Interactive Learning)
    ACTIVITY_CREATED: 'activity_created',
    ACTIVITY_UPDATED: 'activity_updated',
    ACTIVITY_DELETED: 'activity_deleted',
    // Notificaciones
    NOTIFICATION_SENT: 'notification_sent',
    NOTIFICATION_BULK_SENT: 'notification_bulk_sent',
    NOTIFICATION_CONFIG_UPDATED: 'notification_config_updated',
    NOTIFICATION_CLEANUP: 'notification_cleanup',
    // Configuración
    SETTINGS_UPDATED: 'settings_updated',
    // Sistema
    SYSTEM_ERROR: 'system_error',
    CRITICAL_ERROR: 'critical_error'
} as const;

export const auditSeverity = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
} as const;

export const auditLog = sqliteTable(
    'audit_log',
    {
        id: text('id').primaryKey(),
        timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
        action: text('action').notNull(),
        userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
        targetType: text('target_type'), // 'user', 'course', 'settings', etc.
        targetId: text('target_id'), // ID del recurso afectado
        details: text('details'), // JSON con detalles de la acción
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        severity: text('severity')
            .$type<(typeof auditSeverity)[keyof typeof auditSeverity]>()
            .default('info')
    },
    (table) => [
        index('audit_log_timestamp_idx').on(table.timestamp),
        index('audit_log_action_idx').on(table.action),
        index('audit_log_userId_idx').on(table.userId),
        index('audit_log_severity_idx').on(table.severity)
    ]
);

export type AuditLog = typeof auditLog.$inferSelect;
