import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { user } from './users';

// ============================================
// SISTEMA DE GESTIÓN DE ARCHIVOS
// ============================================

export const fileType = {
    DOCUMENT: 'document',
    IMAGE: 'image'
} as const;

export const fileCategory = {
    AVATAR: 'avatar',
    COURSE: 'course',
    CHAT: 'chat',
    RAG_DOCUMENT: 'rag_document',
    PUBLIC: 'public'
} as const;

export const fileEntityType = {
    USER: 'user',
    COURSE: 'course',
    INTERACTIVE_LEARNING: 'interactive_learning',
    INTERACTIVE_LEARNING_CHAT: 'interactive_learning_chat',
    SYSTEM: 'system'
} as const;

export const fileVisibility = {
    PUBLIC: 'public',
    PRIVATE: 'private',
    RESTRICTED: 'restricted'
} as const;

export const fileProcessingStatus = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    ERROR: 'error'
} as const;

export const fileStorage = sqliteTable(
    'file_storage',
    {
        // Identificación
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        displayName: text('display_name'),
        internalPath: text('internal_path').notNull(),
        mimeType: text('mime_type').notNull(),
        size: integer('size').notNull(),
        hash: text('hash').notNull(),

        // Categorización y permisos
        category: text('category')
            .notNull()
            .$type<(typeof fileCategory)[keyof typeof fileCategory]>(),
        entityType: text('entity_type')
            .notNull()
            .$type<(typeof fileEntityType)[keyof typeof fileEntityType]>(),
        entityId: text('entity_id').notNull(),
        visibility: text('visibility')
            .notNull()
            .$type<(typeof fileVisibility)[keyof typeof fileVisibility]>(),
        permissionRules: text('permission_rules'),

        // Procesamiento
        processingStatus: text('processing_status')
            .notNull()
            .$type<(typeof fileProcessingStatus)[keyof typeof fileProcessingStatus]>()
            .default('pending'),
        variants: text('variants'),

        // Auditoría
        uploadedBy: text('uploaded_by')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        uploadedAt: integer('uploaded_at', { mode: 'timestamp' }).notNull(),
        lastAccessedAt: integer('last_accessed_at', { mode: 'timestamp' }),
        accessCount: integer('access_count').default(0).notNull(),

        // Estado
        isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
        isOrphan: integer('is_orphan', { mode: 'boolean' }).default(false).notNull(),
        markedForDeletionAt: integer('marked_for_deletion_at', { mode: 'timestamp' }),
        deletedAt: integer('deleted_at', { mode: 'timestamp' })
    },
    (table) => [
        index('file_storage_hash_idx').on(table.hash),
        index('file_storage_category_idx').on(table.category),
        index('file_storage_entityType_entityId_idx').on(table.entityType, table.entityId),
        index('file_storage_uploadedBy_idx').on(table.uploadedBy),
        index('file_storage_isOrphan_idx').on(table.isOrphan),
        index('file_storage_markedForDeletion_idx').on(table.markedForDeletionAt)
    ]
);

export const fileAccessLog = sqliteTable(
    'file_access_log',
    {
        id: text('id').primaryKey(),
        fileId: text('file_id')
            .notNull()
            .references(() => fileStorage.id, { onDelete: 'cascade' }),
        userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
        action: text('action').notNull(),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        success: integer('success', { mode: 'boolean' }).default(true).notNull(),
        errorMessage: text('error_message'),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('file_access_log_fileId_idx').on(table.fileId),
        index('file_access_log_userId_idx').on(table.userId),
        index('file_access_log_createdAt_idx').on(table.createdAt)
    ]
);

export const fileSystemSetting = sqliteTable('file_system_setting', {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique(),
    value: text('value').notNull(),
    description: text('description'),
    updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export type FileStorage = typeof fileStorage.$inferSelect;
export type FileAccessLog = typeof fileAccessLog.$inferSelect;
export type FileSystemSetting = typeof fileSystemSetting.$inferSelect;
