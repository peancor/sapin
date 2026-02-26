import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { user } from './users';
import { course } from './courses';
import { chat } from './chat';
import { fileType, fileStorage } from './files';
import type { RagConfig } from '$lib/server/rag/config';

// ============================================
// INTERACTIVE LEARNING STATUS LIFECYCLE
// ============================================

export const interactiveLearningStatus = {
    HIDDEN: 'hidden',
    PUBLISHED: 'published',
    CLOSED: 'closed',
    ARCHIVED: 'archived'
} as const;

export type InteractiveLearningStatusType = (typeof interactiveLearningStatus)[keyof typeof interactiveLearningStatus];

// ============================================
// INTERACTIVE LEARNING TABLE
// ============================================

export const interactiveLearning = sqliteTable(
    'interactive_learning',
    {
        id: text('id').primaryKey(),

        // Identificación
        name: text('name').notNull(),
        slug: text('slug').notNull().unique(),
        description: text('description'),
        image: text('image'),
        type: text('type').notNull(),
        content: text('content').notNull(), // JSON content for the interactive experience

        // Ciclo de vida
        status: text('status').$type<InteractiveLearningStatusType>().notNull().default('hidden'),
        publishedAt: integer('published_at', { mode: 'timestamp' }),
        closedAt: integer('closed_at', { mode: 'timestamp' }),
        archivedAt: integer('archived_at', { mode: 'timestamp' }),

        // Timestamps
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),

        // Extensibilidad (JSON: difficulty, estimatedMinutes, tags, language, custom)
        metadata: text('metadata')
    },
    (table) => [
        index('interactive_learning_slug_idx').on(table.slug),
        index('interactive_learning_status_idx').on(table.status)
    ]
);

export const courseInteractiveLearning = sqliteTable(
    'course_interactive_learning',
    {
        id: text('id').primaryKey(),
        courseId: text('course_id')
            .notNull()
            .references(() => course.id),
        interactiveLearningId: text('interactive_learning_id')
            .notNull()
            .references(() => interactiveLearning.id),
        order: integer('order').notNull(), // Para ordenar las experiencias dentro de un curso
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('course_interactive_learning_courseId_idx').on(table.courseId),
        index('course_interactive_learning_id_idx').on(table.interactiveLearningId)
    ]
);

export const interactiveLearningChat = sqliteTable(
    'interactive_learning_chat',
    {
        // El id ES la relación con interactiveLearning (patrón de herencia 1:1)
        id: text('id')
            .primaryKey()
            .references(() => interactiveLearning.id, { onDelete: 'cascade' }),
        llmRole: text('llm_role'), // Campo para el rol de LLM
        llmInstructions: text('llm_instructions'), // Campo para las instrucciones de LLM
        llmContext: text('llm_context'), // Campo de contexto adicional para el chat
        systemPrompt: text('system_prompt'),
        llmModel: text('llm_model'),
        temperature: real('temperature'),
        maxTokens: integer('max_tokens'),
        topP: real('top_p'),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        metadata: text('metadata'),
        // RAG con Qdrant
        ragEnabled: integer('rag_enabled', { mode: 'boolean' }).default(false),
        ragCollectionName: text('rag_collection_name'), // Nombre de la colección en Qdrant
        ragConfig: text('rag_config', { mode: 'json' }).$type<RagConfig>()
    }
);

// Add user chats table to link users with interactive learning chats
// Note: interactiveLearningChatId references interactiveLearning.id (not interactiveLearningChat.id)
// so that both chat AND agent activities can store sessions here using the same column.
export const userInteractiveLearningChat = sqliteTable(
    'user_interactive_learning_chat',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id),
        interactiveLearningChatId: text('interactive_learning_chat_id')
            .notNull()
            .references(() => interactiveLearning.id),
        chatId: text('chat_id')
            .notNull()
            .references(() => chat.id),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('user_interactive_learning_chat_userId_idx').on(table.userId),
        index('user_interactive_learning_chat_ilChatId_idx').on(table.interactiveLearningChatId)
    ]
);

// Tabla para documentos RAG asociados a un chat interactivo
export const interactiveLearningChatRagDocument = sqliteTable(
    'interactive_learning_chat_rag_document',
    {
        id: text('id').primaryKey(),
        interactiveLearningChatId: text('interactive_learning_chat_id')
            .notNull()
            .references(() => interactiveLearningChat.id, { onDelete: 'cascade' }),
        name: text('name').notNull(), // Nombre del documento
        originalPath: text('original_path'), // Ruta al archivo original (si existe)
        fileType: text('file_type').notNull(), // pdf, docx, txt, etc.
        fileSize: integer('file_size'), // Tamaño en bytes
        chunkCount: integer('chunk_count').default(0), // Número de chunks generados
        totalCharacters: integer('total_characters').default(0), // Total de caracteres
        status: text('status').notNull().default('pending'), // pending, processing, indexed, error
        errorMessage: text('error_message'), // Mensaje de error si falló
        qdrantPointIds: text('qdrant_point_ids'), // JSON array con los IDs de los puntos en Qdrant
        metadata: text('metadata'), // Metadata adicional en JSON
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('interactive_learning_chat_rag_document_chat_idx').on(table.interactiveLearningChatId),
        index('interactive_learning_chat_rag_document_status_idx').on(table.status)
    ]
);

export const interactiveLearningChatFile = sqliteTable(
    'interactive_learning_chat_file',
    {
        id: text('id').primaryKey(),
        interactiveLearningChatId: text('interactive_learning_chat_id')
            .notNull()
            .references(() => interactiveLearningChat.id),
        name: text('name').notNull(),
        path: text('path').notNull(),
        type: text('type').$type<keyof typeof fileType>().notNull(),
        size: integer('size').notNull(),
        mimeType: text('mime_type').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [index('interactive_learning_chat_file_idx').on(table.interactiveLearningChatId)]
);

// Shared files for any interactive learning activity (chat/agent/others)
export const interactiveLearningFile = sqliteTable(
    'interactive_learning_file',
    {
        id: text('id').primaryKey(),
        interactiveLearningId: text('interactive_learning_id')
            .notNull()
            .references(() => interactiveLearning.id, { onDelete: 'cascade' }),
        fileStorageId: text('file_storage_id').references(() => fileStorage.id, { onDelete: 'set null' }),
        name: text('name').notNull(),
        path: text('path').notNull(),
        type: text('type').$type<keyof typeof fileType>().notNull(),
        size: integer('size').notNull(),
        mimeType: text('mime_type').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('interactive_learning_file_il_idx').on(table.interactiveLearningId),
        index('interactive_learning_file_storage_idx').on(table.fileStorageId)
    ]
);

// Shared RAG documents for any interactive learning activity (chat/agent/others)
export const interactiveLearningRagDocument = sqliteTable(
    'interactive_learning_rag_document',
    {
        id: text('id').primaryKey(),
        interactiveLearningId: text('interactive_learning_id')
            .notNull()
            .references(() => interactiveLearning.id, { onDelete: 'cascade' }),
        fileStorageId: text('file_storage_id').references(() => fileStorage.id, { onDelete: 'set null' }),
        name: text('name').notNull(),
        originalPath: text('original_path'),
        fileType: text('file_type').notNull(),
        fileSize: integer('file_size'),
        chunkCount: integer('chunk_count').default(0),
        totalCharacters: integer('total_characters').default(0),
        status: text('status').notNull().default('pending'),
        errorMessage: text('error_message'),
        qdrantPointIds: text('qdrant_point_ids'),
        metadata: text('metadata'),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('interactive_learning_rag_document_il_idx').on(table.interactiveLearningId),
        index('interactive_learning_rag_document_status_idx').on(table.status),
        index('interactive_learning_rag_document_storage_idx').on(table.fileStorageId)
    ]
);

// ========== Drizzle Relations ==========

export const interactiveLearningRelations = relations(interactiveLearning, ({ one, many }) => ({
    chat: one(interactiveLearningChat, {
        fields: [interactiveLearning.id],
        references: [interactiveLearningChat.id]
    }),
    courses: many(courseInteractiveLearning),
    files: many(interactiveLearningFile),
    ragDocuments: many(interactiveLearningRagDocument)
}));

export const interactiveLearningChatRelations = relations(interactiveLearningChat, ({ one, many }) => ({
    interactiveLearning: one(interactiveLearning, {
        fields: [interactiveLearningChat.id],
        references: [interactiveLearning.id]
    }),
    userChats: many(userInteractiveLearningChat),
    ragDocuments: many(interactiveLearningChatRagDocument),
    files: many(interactiveLearningChatFile)
}));

export const courseInteractiveLearningRelations = relations(courseInteractiveLearning, ({ one }) => ({
    course: one(course, {
        fields: [courseInteractiveLearning.courseId],
        references: [course.id]
    }),
    interactiveLearning: one(interactiveLearning, {
        fields: [courseInteractiveLearning.interactiveLearningId],
        references: [interactiveLearning.id]
    })
}));

export const userInteractiveLearningChatRelations = relations(userInteractiveLearningChat, ({ one }) => ({
    user: one(user, {
        fields: [userInteractiveLearningChat.userId],
        references: [user.id]
    }),
    interactiveLearningChat: one(interactiveLearningChat, {
        fields: [userInteractiveLearningChat.interactiveLearningChatId],
        references: [interactiveLearningChat.id]
    }),
    chat: one(chat, {
        fields: [userInteractiveLearningChat.chatId],
        references: [chat.id]
    })
}));

export const interactiveLearningChatRagDocumentRelations = relations(interactiveLearningChatRagDocument, ({ one }) => ({
    interactiveLearningChat: one(interactiveLearningChat, {
        fields: [interactiveLearningChatRagDocument.interactiveLearningChatId],
        references: [interactiveLearningChat.id]
    })
}));

export const interactiveLearningChatFileRelations = relations(interactiveLearningChatFile, ({ one }) => ({
    interactiveLearningChat: one(interactiveLearningChat, {
        fields: [interactiveLearningChatFile.interactiveLearningChatId],
        references: [interactiveLearningChat.id]
    })
}));

export const interactiveLearningFileRelations = relations(interactiveLearningFile, ({ one }) => ({
    interactiveLearning: one(interactiveLearning, {
        fields: [interactiveLearningFile.interactiveLearningId],
        references: [interactiveLearning.id]
    }),
    storageFile: one(fileStorage, {
        fields: [interactiveLearningFile.fileStorageId],
        references: [fileStorage.id]
    })
}));

export const interactiveLearningRagDocumentRelations = relations(interactiveLearningRagDocument, ({ one }) => ({
    interactiveLearning: one(interactiveLearning, {
        fields: [interactiveLearningRagDocument.interactiveLearningId],
        references: [interactiveLearning.id]
    }),
    storageFile: one(fileStorage, {
        fields: [interactiveLearningRagDocument.fileStorageId],
        references: [fileStorage.id]
    })
}));

// ========== Drizzle-Zod Schemas ==========

export const insertInteractiveLearningSchema = createInsertSchema(interactiveLearning, {
    name: z.string().min(1).max(255),
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug solo puede contener letras minúsculas, números y guiones'),
    type: z.string(),
    content: z.string(),
    status: z.enum(['hidden', 'published', 'closed', 'archived']).default('hidden')
});
export const selectInteractiveLearningSchema = createSelectSchema(interactiveLearning);

export const insertInteractiveLearningChatSchema = createInsertSchema(interactiveLearningChat, {
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    topP: z.number().min(0).max(1).optional()
});
export const selectInteractiveLearningChatSchema = createSelectSchema(interactiveLearningChat);

export const insertCourseInteractiveLearningSchema = createInsertSchema(courseInteractiveLearning);
export const selectCourseInteractiveLearningSchema = createSelectSchema(courseInteractiveLearning);

export const insertUserInteractiveLearningChatSchema = createInsertSchema(userInteractiveLearningChat);
export const selectUserInteractiveLearningChatSchema = createSelectSchema(userInteractiveLearningChat);

export const insertInteractiveLearningChatRagDocumentSchema = createInsertSchema(interactiveLearningChatRagDocument);
export const selectInteractiveLearningChatRagDocumentSchema = createSelectSchema(interactiveLearningChatRagDocument);

export const insertInteractiveLearningChatFileSchema = createInsertSchema(interactiveLearningChatFile);
export const selectInteractiveLearningChatFileSchema = createSelectSchema(interactiveLearningChatFile);

export const insertInteractiveLearningFileSchema = createInsertSchema(interactiveLearningFile);
export const selectInteractiveLearningFileSchema = createSelectSchema(interactiveLearningFile);

export const insertInteractiveLearningRagDocumentSchema = createInsertSchema(interactiveLearningRagDocument);
export const selectInteractiveLearningRagDocumentSchema = createSelectSchema(interactiveLearningRagDocument);

// ========== Type Exports ==========

export type InteractiveLearning = typeof interactiveLearning.$inferSelect;
export type CourseInteractiveLearning = typeof courseInteractiveLearning.$inferSelect;
export type InteractiveLearningChat = typeof interactiveLearningChat.$inferSelect;
export type UserInteractiveLearningChat = typeof userInteractiveLearningChat.$inferSelect;
export type InteractiveLearningChatRagDocument = typeof interactiveLearningChatRagDocument.$inferSelect;
export type InteractiveLearningChatFile = typeof interactiveLearningChatFile.$inferSelect;
export type InteractiveLearningFile = typeof interactiveLearningFile.$inferSelect;
export type InteractiveLearningRagDocument = typeof interactiveLearningRagDocument.$inferSelect;
