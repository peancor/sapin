import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { user } from './users';
import { interactiveLearning } from './interactive';
import { chat } from './chat';

// ============================================
// CATÁLOGO GLOBAL DE HERRAMIENTAS DE AGENTE
// ============================================

export const agentToolCategory = {
    KNOWLEDGE: 'knowledge',
    EVALUATION: 'evaluation',
    COMMUNICATION: 'communication',
    DATA: 'data',
    UI: 'ui'
} as const;

export const agentToolRiskLevel = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high'
} as const;

export const agentToolExecutorType = {
    BUILTIN: 'builtin',
    HTTP: 'http',
    SCRIPT: 'script'
} as const;

export const agentToolCallStatus = {
    PENDING: 'pending',
    AWAITING_CONFIRMATION: 'awaiting_confirmation',
    AWAITING_UI_RESPONSE: 'awaiting_ui_response',
    EXECUTING: 'executing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REJECTED: 'rejected'
} as const;

export const agentMessageRole = {
    USER: 'user',
    ASSISTANT: 'assistant',
    SYSTEM: 'system',
    TOOL: 'tool'
} as const;

export const agentToolDefinition = sqliteTable(
    'agent_tool_definition',
    {
        id: text('id').primaryKey(),

        // Identificación
        name: text('name').notNull().unique(),          // Identificador técnico: "search_course_content"
        displayName: text('display_name').notNull(),    // Para mostrar al usuario
        description: text('description').notNull(),     // Para el LLM: cuándo y cómo usar la herramienta
        category: text('category').notNull(),           // knowledge | evaluation | communication | data | ui

        // Esquemas JSON Schema
        parametersSchema: text('parameters_schema').notNull(), // JSON Schema de los parámetros
        responseSchema: text('response_schema'),                // JSON Schema de la respuesta (opcional)

        // Ejecución
        executorType: text('executor_type').notNull().default('builtin'), // builtin | http | script
        executorConfig: text('executor_config').notNull().default('{}'),  // JSON: { handler, url, timeout, ... }

        // Seguridad
        requiresConfirmation: integer('requires_confirmation', { mode: 'boolean' }).notNull().default(false),
        riskLevel: text('risk_level').notNull().default('low'), // low | medium | high
        requiredPermissions: text('required_permissions'),       // JSON array: ["read_course", "write_grade"]

        // Estado
        isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
        isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false), // No editable por admin

        // Versionado y meta
        version: text('version').notNull().default('1.0.0'),
        metadata: text('metadata'),

        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('agent_tool_def_name_idx').on(table.name),
        index('agent_tool_def_category_idx').on(table.category),
        index('agent_tool_def_active_idx').on(table.isActive)
    ]
);

// ============================================
// CATÁLOGO GLOBAL DE COMPONENTES UI
// ============================================

export const agentUIComponent = sqliteTable(
    'agent_ui_component',
    {
        id: text('id').primaryKey(),

        name: text('name').notNull().unique(),           // "quiz", "flashcard", "code_editor"
        displayName: text('display_name').notNull(),     // "Quiz Interactivo"
        description: text('description').notNull(),      // Para el LLM: cuándo generar este componente
        category: text('category').notNull(),            // "evaluation" | "practice" | "visualization"

        // Esquemas
        propsSchema: text('props_schema').notNull(),     // JSON Schema de las props que genera el LLM
        responseSchema: text('response_schema'),         // JSON Schema del payload que emite el componente

        // Registry frontend
        componentKey: text('component_key').notNull(),   // Clave en UIComponentRegistry frontend: "QuizCard"

        // Configuración de renderizado
        renderConfig: text('render_config'),             // JSON: { maxWidth, interactive, position }

        isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
        isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),

        version: text('version').notNull().default('1.0.0'),
        metadata: text('metadata'),

        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('agent_ui_component_name_idx').on(table.name),
        index('agent_ui_component_key_idx').on(table.componentKey)
    ]
);

// ============================================
// CONFIGURACIÓN DE ACTIVIDAD AGÉNTICA
// (patrón 1:1 heredado de interactiveLearning, igual que interactiveLearningChat)
// ============================================

export const interactiveLearningAgent = sqliteTable('interactive_learning_agent', {
    // El id ES la relación con interactiveLearning (patrón de herencia 1:1)
    id: text('id')
        .primaryKey()
        .references(() => interactiveLearning.id, { onDelete: 'cascade' }),

    // Configuración LLM (misma estructura que interactiveLearningChat)
    llmRole: text('llm_role'),
    llmInstructions: text('llm_instructions'),
    llmContext: text('llm_context'),
    systemPrompt: text('system_prompt'),
    llmModel: text('llm_model'),
    temperature: real('temperature'),
    maxTokens: integer('max_tokens'),
    topP: real('top_p'),

    // Configuración agéntica
    maxToolRoundtrips: integer('max_tool_roundtrips').notNull().default(5),
    parallelToolCalls: integer('parallel_tool_calls', { mode: 'boolean' }).notNull().default(false),
    toolChoice: text('tool_choice').notNull().default('auto'), // "auto" | "required" | "none"
    finalizationEnabled: integer('finalization_enabled', { mode: 'boolean' }).notNull().default(true),
    finalizationToolName: text('finalization_tool_name').notNull().default('finalize_activity'),
    finalizationHandler: text('finalization_handler').notNull().default('mark_complete_and_notify'),
    finalizationConfig: text('finalization_config'),
    requireFinalizationToolCall: integer('require_finalization_tool_call', { mode: 'boolean' })
        .notNull()
        .default(true),

    // RAG (mismo patrón que interactiveLearningChat)
    ragEnabled: integer('rag_enabled', { mode: 'boolean' }).default(false),
    ragCollectionName: text('rag_collection_name'),
    ragConfig: text('rag_config'),

    metadata: text('metadata'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

// ============================================
// HERRAMIENTAS HABILITADAS POR ACTIVIDAD
// ============================================

export const agentActivityTool = sqliteTable(
    'agent_activity_tool',
    {
        id: text('id').primaryKey(),
        agentActivityId: text('agent_activity_id')
            .notNull()
            .references(() => interactiveLearningAgent.id, { onDelete: 'cascade' }),
        toolDefinitionId: text('tool_definition_id')
            .notNull()
            .references(() => agentToolDefinition.id, { onDelete: 'cascade' }),

        // Override de configuración por actividad
        configOverride: text('config_override'), // JSON: override de params, permisos, etc.
        isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),

        createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('agent_activity_tool_activity_idx').on(table.agentActivityId),
        index('agent_activity_tool_def_idx').on(table.toolDefinitionId)
    ]
);

// ============================================
// MENSAJES AGÉNTICOS
// (reemplaza la tabla `message` para actividades type='agent')
// ============================================

export const agentMessage = sqliteTable(
    'agent_message',
    {
        id: text('id').primaryKey(),
        chatId: text('chat_id')
            .notNull()
            .references(() => chat.id),

        // Rol del mensaje
        role: text('role').notNull(), // "user" | "assistant" | "system" | "tool"

        // Contenido textual principal
        textContent: text('text_content'),

        // Para mensajes tipo "tool": referencia al toolCall que generó este resultado
        toolCallId: text('tool_call_id'),
        toolName: text('tool_name'),

        // Orden dentro del mensaje compuesto (para reconstruir la secuencia)
        sequenceOrder: integer('sequence_order').notNull().default(0),

        // Métricas
        tokenCount: integer('token_count'),
        finishReason: text('finish_reason'),

        metadata: text('metadata'),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('agent_message_chat_idx').on(table.chatId),
        index('agent_message_role_idx').on(table.role),
        index('agent_message_tool_call_idx').on(table.toolCallId),
        index('agent_message_created_idx').on(table.createdAt)
    ]
);

// ============================================
// TOOL CALLS (dentro de mensajes assistant)
// ============================================

export const agentToolCall = sqliteTable(
    'agent_tool_call',
    {
        id: text('id').primaryKey(),              // toolCallId generado por el LLM
        messageId: text('message_id')
            .notNull()
            .references(() => agentMessage.id, { onDelete: 'cascade' }),

        toolName: text('tool_name').notNull(),
        toolDefinitionId: text('tool_definition_id')
            .references(() => agentToolDefinition.id),

        // Input / Output
        arguments: text('arguments').notNull(),   // JSON de los args enviados
        result: text('result'),                   // JSON del resultado

        // Estado del tool call
        status: text('status').notNull().default('pending'),
        // "pending" | "awaiting_confirmation" | "awaiting_ui_response" | "executing" | "completed" | "failed" | "rejected"

        // Confirmación HITL
        confirmedBy: text('confirmed_by').references(() => user.id),
        confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
        rejectionReason: text('rejection_reason'),

        // Métricas
        durationMs: integer('duration_ms'),
        errorMessage: text('error_message'),

        createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('agent_tool_call_message_idx').on(table.messageId),
        index('agent_tool_call_status_idx').on(table.status),
        index('agent_tool_call_tool_def_idx').on(table.toolDefinitionId)
    ]
);

// ============================================
// INSTANCIAS DE COMPONENTES UI EN MENSAJES
// ============================================

export const agentUIInstance = sqliteTable(
    'agent_ui_instance',
    {
        id: text('id').primaryKey(),
        messageId: text('message_id')
            .notNull()
            .references(() => agentMessage.id, { onDelete: 'cascade' }),
        uiComponentId: text('ui_component_id')
            .notNull()
            .references(() => agentUIComponent.id),

        // Props generadas por el LLM para esta instancia
        props: text('props').notNull(),

        // Estado persistente del componente (actualizado por interacción del usuario)
        state: text('state'),

        // Respuesta estructurada del usuario
        userResponse: text('user_response'),
        respondedAt: integer('responded_at', { mode: 'timestamp' }),

        // Evaluación (para componentes de tipo quiz/exercise)
        score: real('score'),                   // 0.0 - 1.0
        evaluationData: text('evaluation_data'), // JSON detallado de evaluación

        metadata: text('metadata'),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
    },
    (table) => [
        index('agent_ui_instance_message_idx').on(table.messageId),
        index('agent_ui_instance_component_idx').on(table.uiComponentId)
    ]
);

// ============================================
// DRIZZLE RELATIONS
// ============================================

export const agentToolDefinitionRelations = relations(agentToolDefinition, ({ many }) => ({
    activityTools: many(agentActivityTool)
}));

export const agentUIComponentRelations = relations(agentUIComponent, ({ many }) => ({
    instances: many(agentUIInstance)
}));

export const interactiveLearningAgentRelations = relations(
    interactiveLearningAgent,
    ({ one, many }) => ({
        interactiveLearning: one(interactiveLearning, {
            fields: [interactiveLearningAgent.id],
            references: [interactiveLearning.id]
        }),
        activityTools: many(agentActivityTool)
    })
);

export const agentActivityToolRelations = relations(agentActivityTool, ({ one }) => ({
    agentActivity: one(interactiveLearningAgent, {
        fields: [agentActivityTool.agentActivityId],
        references: [interactiveLearningAgent.id]
    }),
    toolDefinition: one(agentToolDefinition, {
        fields: [agentActivityTool.toolDefinitionId],
        references: [agentToolDefinition.id]
    })
}));

export const agentMessageRelations = relations(agentMessage, ({ one, many }) => ({
    chat: one(chat, {
        fields: [agentMessage.chatId],
        references: [chat.id]
    }),
    toolCalls: many(agentToolCall),
    uiInstances: many(agentUIInstance)
}));

export const agentToolCallRelations = relations(agentToolCall, ({ one }) => ({
    message: one(agentMessage, {
        fields: [agentToolCall.messageId],
        references: [agentMessage.id]
    }),
    toolDefinition: one(agentToolDefinition, {
        fields: [agentToolCall.toolDefinitionId],
        references: [agentToolDefinition.id]
    }),
    confirmedByUser: one(user, {
        fields: [agentToolCall.confirmedBy],
        references: [user.id]
    })
}));

export const agentUIInstanceRelations = relations(agentUIInstance, ({ one }) => ({
    message: one(agentMessage, {
        fields: [agentUIInstance.messageId],
        references: [agentMessage.id]
    }),
    uiComponent: one(agentUIComponent, {
        fields: [agentUIInstance.uiComponentId],
        references: [agentUIComponent.id]
    })
}));

// ============================================
// TYPE EXPORTS
// ============================================

export type AgentToolDefinition = typeof agentToolDefinition.$inferSelect;
export type NewAgentToolDefinition = typeof agentToolDefinition.$inferInsert;

export type AgentUIComponent = typeof agentUIComponent.$inferSelect;
export type NewAgentUIComponent = typeof agentUIComponent.$inferInsert;

export type InteractiveLearningAgent = typeof interactiveLearningAgent.$inferSelect;
export type NewInteractiveLearningAgent = typeof interactiveLearningAgent.$inferInsert;

export type AgentActivityTool = typeof agentActivityTool.$inferSelect;

export type AgentMessage = typeof agentMessage.$inferSelect;
export type NewAgentMessage = typeof agentMessage.$inferInsert;

export type AgentToolCall = typeof agentToolCall.$inferSelect;
export type NewAgentToolCall = typeof agentToolCall.$inferInsert;

export type AgentUIInstance = typeof agentUIInstance.$inferSelect;
export type NewAgentUIInstance = typeof agentUIInstance.$inferInsert;
