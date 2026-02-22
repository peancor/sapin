import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { user } from './users';

export const chat = sqliteTable('chat', {
    id: text('id').primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => user.id),
    title: text('title'), // Hacemos el título opcional
    metadata: text('metadata'), // Campo para contenido arbitrario
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const messageType = {
    SYSTEM: 'system',
    USER: 'user',
    ASSISTANT: 'assistant'
} as const;

export const message = sqliteTable('message', {
    id: text('id').primaryKey(),
    chatId: text('chat_id')
        .notNull()
        .references(() => chat.id),
    content: text('content').notNull(),
    type: text('type').notNull().$type<keyof typeof messageType>(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    tokenCount: integer('token_count').notNull(),
    finishReason: text('finish_reason').notNull(),
    metadata: text('metadata')
});

export type Chat = typeof chat.$inferSelect;
export type Message = typeof message.$inferSelect;
