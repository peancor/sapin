import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { user } from './users';
import { course } from './courses';
import { interactiveLearning } from './interactive';
import { chat } from './chat';

// ============================================
// SISTEMA DE GESTIÓN DE IA
// ============================================

export const aiProviderType = {
    OPENAI: 'openai',
    OPENROUTER: 'openrouter',
    ANTHROPIC: 'anthropic',
    GOOGLE: 'google',
    LMSTUDIO: 'lmstudio',
    CUSTOM: 'custom'
} as const;

export const aiModelCapability = {
    TEXT: 'text',
    IMAGE: 'image',
    VISION: 'vision',
    EMBEDDING: 'embedding',
    AUDIO: 'audio'
} as const;

export const aiProvider = sqliteTable('ai_provider', {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    displayName: text('display_name').notNull(),
    type: text('type').notNull().$type<(typeof aiProviderType)[keyof typeof aiProviderType]>(),
    baseUrl: text('base_url'), // URL base para APIs custom
    apiKey: text('api_key'), // API key del proveedor (encriptada o en texto plano)
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const aiModel = sqliteTable(
    'ai_model',
    {
        id: text('id').primaryKey(),
        providerId: text('provider_id')
            .notNull()
            .references(() => aiProvider.id, { onDelete: 'cascade' }),
        name: text('name').notNull().unique(), // Nombre interno del modelo (ej: gpt-5)
        displayName: text('display_name').notNull(), // Nombre mostrado en UI
        description: text('description'),
        capabilities: text('capabilities'), // JSON array de capacidades
        contextWindow: integer('context_window'), // Tokens máximos de contexto
        maxOutputTokens: integer('max_output_tokens'),
        inputPricePerMillion: real('input_price_per_million'), // Precio por millón de tokens de entrada
        outputPricePerMillion: real('output_price_per_million'), // Precio por millón de tokens de salida
        isDefault: integer('is_default', { mode: 'boolean' }).default(false).notNull(),
        isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
        sortOrder: integer('sort_order').default(0).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('ai_model_providerId_idx').on(table.providerId),
        index('ai_model_isActive_idx').on(table.isActive)
    ]
);

export const aiUsageLog = sqliteTable(
    'ai_usage_log',
    {
        id: text('id').primaryKey(),
        modelId: text('model_id')
            .notNull()
            .references(() => aiModel.id, { onDelete: 'cascade' }),
        userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
        courseId: text('course_id').references(() => course.id, { onDelete: 'set null' }),
        interactiveLearningId: text('interactive_learning_id').references(() => interactiveLearning.id, {
            onDelete: 'set null'
        }),
        chatId: text('chat_id').references(() => chat.id, { onDelete: 'set null' }),
        operation: text('operation').notNull(), // 'chat', 'completion', 'image', 'embedding'
        inputTokens: integer('input_tokens').default(0).notNull(),
        outputTokens: integer('output_tokens').default(0).notNull(),
        totalTokens: integer('total_tokens').default(0).notNull(),
        estimatedCost: real('estimated_cost').default(0), // Costo estimado en USD
        durationMs: integer('duration_ms'), // Tiempo de respuesta
        success: integer('success', { mode: 'boolean' }).default(true).notNull(),
        errorMessage: text('error_message'),
        metadata: text('metadata'), // JSON con datos adicionales
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('ai_usage_log_modelId_idx').on(table.modelId),
        index('ai_usage_log_userId_idx').on(table.userId),
        index('ai_usage_log_courseId_idx').on(table.courseId),
        index('ai_usage_log_createdAt_idx').on(table.createdAt),
        index('ai_usage_log_interactiveLearningId_idx').on(table.interactiveLearningId)
    ]
);

export const aiQuotaType = {
    GLOBAL: 'global', // Cuota global del sistema
    USER: 'user', // Cuota por usuario
    COURSE: 'course', // Cuota por curso
    ACTIVITY: 'activity' // Cuota por actividad interactiva
} as const;

export const aiQuotaPeriod = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    UNLIMITED: 'unlimited'
} as const;

export const aiQuota = sqliteTable(
    'ai_quota',
    {
        id: text('id').primaryKey(),
        type: text('type').notNull().$type<(typeof aiQuotaType)[keyof typeof aiQuotaType]>(),
        targetId: text('target_id'), // userId, courseId, o null para global
        modelId: text('model_id').references(() => aiModel.id, { onDelete: 'cascade' }), // null = aplica a todos los modelos
        period: text('period')
            .notNull()
            .$type<(typeof aiQuotaPeriod)[keyof typeof aiQuotaPeriod]>()
            .default('monthly'),
        maxTokens: integer('max_tokens'), // null = sin límite de tokens
        maxRequests: integer('max_requests'), // null = sin límite de peticiones
        maxCost: real('max_cost'), // null = sin límite de costo (en USD)
        currentTokens: integer('current_tokens').default(0).notNull(),
        currentRequests: integer('current_requests').default(0).notNull(),
        currentCost: real('current_cost').default(0).notNull(),
        periodStartedAt: integer('period_started_at', { mode: 'timestamp' }).notNull(),
        isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('ai_quota_type_idx').on(table.type),
        index('ai_quota_targetId_idx').on(table.targetId),
        index('ai_quota_modelId_idx').on(table.modelId)
    ]
);

// Resumen diario de uso de IA para reportes
export const aiUsageDailyStats = sqliteTable(
    'ai_usage_daily_stats',
    {
        id: text('id').primaryKey(),
        date: text('date').notNull(), // YYYY-MM-DD
        modelId: text('model_id')
            .notNull()
            .references(() => aiModel.id, { onDelete: 'cascade' }),
        totalRequests: integer('total_requests').default(0).notNull(),
        successfulRequests: integer('successful_requests').default(0).notNull(),
        failedRequests: integer('failed_requests').default(0).notNull(),
        totalInputTokens: integer('total_input_tokens').default(0).notNull(),
        totalOutputTokens: integer('total_output_tokens').default(0).notNull(),
        totalTokens: integer('total_tokens').default(0).notNull(),
        totalCost: real('total_cost').default(0).notNull(),
        avgDurationMs: integer('avg_duration_ms').default(0).notNull(),
        uniqueUsers: integer('unique_users').default(0).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('ai_usage_daily_stats_date_idx').on(table.date),
        index('ai_usage_daily_stats_modelId_idx').on(table.modelId),
        index('ai_usage_daily_stats_date_model_idx').on(table.date, table.modelId)
    ]
);

export type AIProvider = typeof aiProvider.$inferSelect;
export type AIModel = typeof aiModel.$inferSelect;
export type AIUsageLog = typeof aiUsageLog.$inferSelect;
export type AIQuota = typeof aiQuota.$inferSelect;
export type AIUsageDailyStats = typeof aiUsageDailyStats.$inferSelect;
