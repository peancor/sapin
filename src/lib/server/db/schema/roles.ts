import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { user } from './users';

// ============================================
// SISTEMA DE ROLES Y PERMISOS (Fase 1)
// ============================================

export const role = sqliteTable('role', {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    permissions: text('permissions'), // JSON con permisos específicos
    level: integer('level').default(0).notNull(), // Jerarquía: admin=100, teacher=50, student=10
    isSystem: integer('is_system', { mode: 'boolean' }).default(false).notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const userRoleAssignment = sqliteTable(
    'user_role',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        roleId: text('role_id')
            .notNull()
            .references(() => role.id, { onDelete: 'restrict' }),
        assignedBy: text('assigned_by').references(() => user.id, { onDelete: 'set null' }),
        assignedAt: integer('assigned_at', { mode: 'timestamp' }).notNull(),
        expiresAt: integer('expires_at', { mode: 'timestamp' }), // null = permanente
        reason: text('reason'), // Motivo de la asignación
        isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull()
    },
    (table) => [
        index('user_role_userId_idx').on(table.userId),
        index('user_role_roleId_idx').on(table.roleId),
        index('user_role_active_idx').on(table.userId, table.isActive)
    ]
);

export const roleAuditAction = {
    ASSIGNED: 'assigned',
    REVOKED: 'revoked',
    EXPIRED: 'expired',
    MODIFIED: 'modified'
} as const;

export const roleAuditLog = sqliteTable(
    'role_audit_log',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        roleId: text('role_id').notNull(),
        roleName: text('role_name').notNull(), // Snapshot del nombre
        action: text('action')
            .notNull()
            .$type<(typeof roleAuditAction)[keyof typeof roleAuditAction]>(),
        performedBy: text('performed_by').references(() => user.id, { onDelete: 'set null' }),
        reason: text('reason'),
        metadata: text('metadata'), // JSON con datos adicionales
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('role_audit_log_userId_idx').on(table.userId),
        index('role_audit_log_createdAt_idx').on(table.createdAt)
    ]
);

export type Role = typeof role.$inferSelect;
export type UserRoleAssignment = typeof userRoleAssignment.$inferSelect;
export type RoleAuditLog = typeof roleAuditLog.$inferSelect;
