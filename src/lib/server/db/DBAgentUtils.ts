import { db } from '.';
import { eq, and, asc, desc } from 'drizzle-orm';
import * as schema from './schema';
import { nanoid } from 'nanoid';
import type {
    AgentActivityConfig,
    ToolDefinitionResolved,
    AgentHistoryMessage
} from '$lib/types/agent';
import type { ModelMessage } from 'ai';

export default class DBAgentUtils {
    // ─── Actividad Agéntica ───

    static async getAgentActivity(
        activityId: string
    ): Promise<typeof schema.interactiveLearningAgent.$inferSelect | null> {
        const [record] = await db
            .select()
            .from(schema.interactiveLearningAgent)
            .where(eq(schema.interactiveLearningAgent.id, activityId));
        return record ?? null;
    }

    static async createAgentActivity(data: typeof schema.interactiveLearningAgent.$inferInsert) {
        return await db.insert(schema.interactiveLearningAgent).values(data);
    }

    static async updateAgentActivity(
        activityId: string,
        data: Partial<typeof schema.interactiveLearningAgent.$inferInsert>
    ) {
        return await db
            .update(schema.interactiveLearningAgent)
            .set(data)
            .where(eq(schema.interactiveLearningAgent.id, activityId));
    }

    // ─── Herramientas Habilitadas por Actividad ───

    static async getEnabledToolsForActivity(activityId: string): Promise<ToolDefinitionResolved[]> {
        const rows = await db
            .select({
                tool: schema.agentToolDefinition,
                activityTool: schema.agentActivityTool
            })
            .from(schema.agentActivityTool)
            .innerJoin(
                schema.agentToolDefinition,
                eq(schema.agentActivityTool.toolDefinitionId, schema.agentToolDefinition.id)
            )
            .where(
                and(
                    eq(schema.agentActivityTool.agentActivityId, activityId),
                    eq(schema.agentActivityTool.isEnabled, true),
                    eq(schema.agentToolDefinition.isActive, true)
                )
            );

        return rows.map((row) => {
            const tool = row.tool;
            const activityTool = row.activityTool;

            let parametersSchema: Record<string, unknown> = {};
            let responseSchema: Record<string, unknown> | undefined = undefined;
            let executorConfig: Record<string, unknown> = {};
            let configOverride: Record<string, unknown> | undefined = undefined;

            try {
                parametersSchema = JSON.parse(tool.parametersSchema) as Record<string, unknown>;
            } catch {
                // Use empty schema as fallback
            }
            if (tool.responseSchema) {
                try {
                    responseSchema = JSON.parse(tool.responseSchema) as Record<string, unknown>;
                } catch {
                    // ignore
                }
            }
            try {
                executorConfig = JSON.parse(tool.executorConfig) as Record<string, unknown>;
            } catch {
                // ignore
            }
            if (activityTool.configOverride) {
                try {
                    configOverride = JSON.parse(activityTool.configOverride) as Record<
                        string,
                        unknown
                    >;
                } catch {
                    // ignore
                }
            }

            return {
                id: tool.id,
                name: tool.name,
                displayName: tool.displayName,
                description: tool.description,
                category: tool.category,
                parametersSchema,
                responseSchema,
                executorType: tool.executorType as 'builtin' | 'http' | 'script',
                executorConfig,
                requiresConfirmation: tool.requiresConfirmation,
                riskLevel: tool.riskLevel as 'low' | 'medium' | 'high',
                configOverride
            } satisfies ToolDefinitionResolved;
        });
    }

    static async setActivityTools(activityId: string, toolIds: string[]) {
        // Eliminar las existentes
        await db
            .delete(schema.agentActivityTool)
            .where(eq(schema.agentActivityTool.agentActivityId, activityId));

        // Insertar las nuevas
        if (toolIds.length > 0) {
            await db.insert(schema.agentActivityTool).values(
                toolIds.map((toolId) => ({
                    id: nanoid(),
                    agentActivityId: activityId,
                    toolDefinitionId: toolId,
                    isEnabled: true,
                    createdAt: new Date()
                }))
            );
        }
    }

    // ─── Mensajes Agénticos ───

    static async saveAgentMessage(data: {
        chatId: string;
        role: string;
        textContent?: string;
        toolCallId?: string;
        toolName?: string;
        sequenceOrder?: number;
        tokenCount?: number;
        finishReason?: string;
        metadata?: string;
    }): Promise<string> {
        const id = nanoid();
        await db.insert(schema.agentMessage).values({
            id,
            chatId: data.chatId,
            role: data.role,
            textContent: data.textContent,
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            sequenceOrder: data.sequenceOrder ?? 0,
            tokenCount: data.tokenCount,
            finishReason: data.finishReason,
            metadata: data.metadata,
            createdAt: new Date()
        });
        return id;
    }

    static async getAgentMessages(chatId: string): Promise<AgentHistoryMessage[]> {
        const messages = await db
            .select()
            .from(schema.agentMessage)
            .where(eq(schema.agentMessage.chatId, chatId))
            .orderBy(asc(schema.agentMessage.createdAt), asc(schema.agentMessage.sequenceOrder));

        return messages.map((m) => ({
            role: m.role as 'user' | 'assistant' | 'system' | 'tool',
            content: m.textContent ?? '',
            toolCallId: m.toolCallId ?? undefined,
            toolName: m.toolName ?? undefined
        }));
    }

    static async updateAgentMessage(
        messageId: string,
        data: Partial<typeof schema.agentMessage.$inferInsert>
    ) {
        await db
            .update(schema.agentMessage)
            .set(data)
            .where(eq(schema.agentMessage.id, messageId));
    }

    static async getAgentMessagesRaw(chatId: string) {
        return await db
            .select()
            .from(schema.agentMessage)
            .where(eq(schema.agentMessage.chatId, chatId))
            .orderBy(asc(schema.agentMessage.createdAt), asc(schema.agentMessage.sequenceOrder));
    }

    // ─── Tool Calls ───

    static async saveToolCall(data: {
        id: string;
        messageId: string;
        toolName: string;
        toolDefinitionId?: string;
        arguments: string;
        status?: string;
    }) {
        await db.insert(schema.agentToolCall).values({
            id: data.id,
            messageId: data.messageId,
            toolName: data.toolName,
            toolDefinitionId: data.toolDefinitionId,
            arguments: data.arguments,
            status: data.status ?? 'pending',
            createdAt: new Date()
        });
    }

    static async updateToolCall(
        toolCallId: string,
        data: Partial<typeof schema.agentToolCall.$inferInsert>
    ) {
        await db
            .update(schema.agentToolCall)
            .set(data)
            .where(eq(schema.agentToolCall.id, toolCallId));
    }

    static async getToolCall(toolCallId: string) {
        const [record] = await db
            .select()
            .from(schema.agentToolCall)
            .where(eq(schema.agentToolCall.id, toolCallId));
        return record ?? null;
    }

    /**
     * Reconstruye el historial de mensajes completo como ModelMessage[] para el resume post-HITL.
     * Para mensajes role='assistant', incluye los ToolCallPart de los agentToolCall asociados.
     */
    static async getAgentMessagesAsModelMessages(chatId: string): Promise<ModelMessage[]> {
        const rawMessages = await db
            .select()
            .from(schema.agentMessage)
            .where(eq(schema.agentMessage.chatId, chatId))
            .orderBy(asc(schema.agentMessage.createdAt), asc(schema.agentMessage.sequenceOrder));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any[] = [];

        for (const msg of rawMessages) {
            if (msg.role === 'user') {
                result.push({ role: 'user', content: msg.textContent ?? '' });
            } else if (msg.role === 'system') {
                result.push({ role: 'system', content: msg.textContent ?? '' });
            } else if (msg.role === 'assistant') {
                // Obtener tool calls asociados a este mensaje
                const toolCalls = await db
                    .select()
                    .from(schema.agentToolCall)
                    .where(eq(schema.agentToolCall.messageId, msg.id))
                    .orderBy(asc(schema.agentToolCall.createdAt));

                if (toolCalls.length > 0) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const content: any[] = [];
                    if (msg.textContent) {
                        content.push({ type: 'text', text: msg.textContent });
                    }
                    for (const tc of toolCalls) {
                        let input: Record<string, unknown> = {};
                        try { input = JSON.parse(tc.arguments) as Record<string, unknown>; } catch { /* ignore */ }
                        content.push({ type: 'tool-call', toolCallId: tc.id, toolName: tc.toolName, input });
                    }
                    result.push({ role: 'assistant', content });
                } else {
                    result.push({ role: 'assistant', content: msg.textContent ?? '' });
                }
            } else if (msg.role === 'tool') {
                result.push({
                    role: 'tool',
                    content: [{
                        type: 'tool-result',
                        toolCallId: msg.toolCallId ?? '',
                        toolName: msg.toolName ?? '',
                        output: { type: 'text', value: msg.textContent ?? '' }
                    }]
                });
            }
        }

        return result as ModelMessage[];
    }

    // ─── Catálogo Global de Herramientas (Admin) ───

    static async getAllToolDefinitions() {
        return await db
            .select()
            .from(schema.agentToolDefinition)
            .orderBy(asc(schema.agentToolDefinition.category), asc(schema.agentToolDefinition.name));
    }

    static async getActiveToolDefinitions() {
        return await db
            .select()
            .from(schema.agentToolDefinition)
            .where(eq(schema.agentToolDefinition.isActive, true))
            .orderBy(asc(schema.agentToolDefinition.category), asc(schema.agentToolDefinition.name));
    }

    static async getToolDefinitionById(id: string) {
        const [record] = await db
            .select()
            .from(schema.agentToolDefinition)
            .where(eq(schema.agentToolDefinition.id, id));
        return record ?? null;
    }

    static async getToolDefinitionByName(name: string) {
        const [record] = await db
            .select()
            .from(schema.agentToolDefinition)
            .where(eq(schema.agentToolDefinition.name, name));
        return record ?? null;
    }

    static async createToolDefinition(
        data: Omit<typeof schema.agentToolDefinition.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
    ) {
        const id = nanoid();
        await db.insert(schema.agentToolDefinition).values({
            id,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return id;
    }

    static async updateToolDefinition(
        id: string,
        data: Partial<typeof schema.agentToolDefinition.$inferInsert>
    ) {
        await db
            .update(schema.agentToolDefinition)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(schema.agentToolDefinition.id, id));
    }

    static async deleteToolDefinition(id: string) {
        await db
            .delete(schema.agentToolDefinition)
            .where(and(eq(schema.agentToolDefinition.id, id), eq(schema.agentToolDefinition.isSystem, false)));
    }

    // ─── Seed de herramientas builtin ───

    static async seedBuiltinTools() {
        const builtinTools = [
            {
                name: 'search_course_content',
                displayName: 'Buscar contenido del curso',
                description:
                    'Busca contenido relevante en los documentos y materiales del curso actual. Úsala cuando el estudiante pregunte algo que pueda estar en el material de estudio.',
                category: 'knowledge',
                parametersSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Términos de búsqueda para encontrar el contenido relevante'
                        },
                        topK: {
                            type: 'integer',
                            description: 'Número máximo de resultados a retornar',
                            default: 5
                        }
                    },
                    required: ['query']
                }),
                responseSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        documents: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    content: { type: 'string' },
                                    source: { type: 'string' },
                                    score: { type: 'number' }
                                }
                            }
                        },
                        totalFound: { type: 'integer' }
                    }
                }),
                executorType: 'builtin' as const,
                executorConfig: JSON.stringify({ handler: 'searchCourseContent' }),
                requiresConfirmation: false,
                riskLevel: 'low' as const,
                isSystem: true,
                version: '1.0.0'
            },
            {
                name: 'get_student_progress',
                displayName: 'Consultar progreso del estudiante',
                description:
                    'Obtiene el progreso actual del estudiante en las actividades del curso. Útil para personalizar el nivel de dificultad o identificar áreas de mejora.',
                category: 'data',
                parametersSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        includeDetails: {
                            type: 'boolean',
                            description: 'Si incluir detalle de cada actividad',
                            default: false
                        }
                    },
                    required: []
                }),
                responseSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        completedActivities: { type: 'integer' },
                        totalActivities: { type: 'integer' },
                        completionRate: { type: 'number' },
                        activities: { type: 'array' }
                    }
                }),
                executorType: 'builtin' as const,
                executorConfig: JSON.stringify({ handler: 'getStudentProgress' }),
                requiresConfirmation: false,
                riskLevel: 'low' as const,
                isSystem: true,
                version: '1.0.0'
            },
            {
                name: 'calculate_expression',
                displayName: 'Calcular expresión matemática',
                description:
                    'Evalúa una expresión matemática de forma segura. Útil para verificar cálculos del estudiante o demostrar operaciones matemáticas.',
                category: 'data',
                parametersSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        expression: {
                            type: 'string',
                            description:
                                'Expresión matemática a evaluar. Ej: "2 * (3 + 4)", "sqrt(16)", "sin(pi/2)"'
                        }
                    },
                    required: ['expression']
                }),
                responseSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        result: { type: 'number' },
                        expression: { type: 'string' },
                        formatted: { type: 'string' }
                    }
                }),
                executorType: 'builtin' as const,
                executorConfig: JSON.stringify({ handler: 'calculateExpression' }),
                requiresConfirmation: false,
                riskLevel: 'low' as const,
                isSystem: true,
                version: '1.0.0'
            },
            {
                name: 'save_grade',
                displayName: 'Guardar calificación',
                description:
                    'Guarda una calificación para el estudiante en la actividad actual u otra del curso. Úsala cuando hayas evaluado al estudiante y quieras registrar su nota. ¡REQUIERE CONFIRMACIÓN del estudiante antes de ejecutarse!',
                category: 'evaluation',
                parametersSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        score: {
                            type: 'number',
                            description: 'Calificación entre 0.0 (0%) y 1.0 (100%)',
                            minimum: 0,
                            maximum: 1
                        },
                        feedback: {
                            type: 'string',
                            description: 'Retroalimentación textual para el estudiante'
                        },
                        activityId: {
                            type: 'string',
                            description: 'ID de la actividad a calificar. Si se omite, usa la actividad actual.'
                        }
                    },
                    required: ['score']
                }),
                responseSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        activityId: { type: 'string' },
                        score: { type: 'number' },
                        scorePercent: { type: 'integer' }
                    }
                }),
                executorType: 'builtin' as const,
                executorConfig: JSON.stringify({ handler: 'saveGrade' }),
                requiresConfirmation: true,
                riskLevel: 'medium' as const,
                isSystem: true,
                version: '1.0.0'
            },
            {
                name: 'send_notification',
                displayName: 'Enviar notificación',
                description:
                    'Envía una notificación in-app al estudiante. Úsala para felicitar logros, recordar tareas pendientes o enviar mensajes importantes. REQUIERE CONFIRMACIÓN antes de enviar.',
                category: 'communication',
                parametersSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'Título breve de la notificación'
                        },
                        message: {
                            type: 'string',
                            description: 'Cuerpo del mensaje de la notificación'
                        },
                        priority: {
                            type: 'string',
                            description: 'Prioridad: low, normal o high',
                            enum: ['low', 'normal', 'high'],
                            default: 'normal'
                        }
                    },
                    required: ['title', 'message']
                }),
                responseSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        title: { type: 'string' },
                        message: { type: 'string' },
                        notificationId: { type: 'string' }
                    }
                }),
                executorType: 'builtin' as const,
                executorConfig: JSON.stringify({ handler: 'sendNotification' }),
                requiresConfirmation: true,
                riskLevel: 'low' as const,
                isSystem: true,
                version: '1.0.0'
            }
        ];

        for (const tool of builtinTools) {
            const existing = await this.getToolDefinitionByName(tool.name);
            if (!existing) {
                await this.createToolDefinition(tool);
            }
        }
    }
}
