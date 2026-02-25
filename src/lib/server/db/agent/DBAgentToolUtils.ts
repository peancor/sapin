import { db } from '..';
import { eq, and, asc } from 'drizzle-orm';
import * as schema from '../schema';
import { nanoid } from 'nanoid';

export default class DBAgentToolUtils {
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
                name: 'render_quiz',
                displayName: 'Mostrar Quiz Interactivo',
                description:
                    'Genera y muestra un quiz interactivo de opción múltiple directamente en el chat. Úsalo cuando quieras evaluar la comprensión del estudiante con preguntas sobre los temas estudiados.',
                category: 'ui',
                parametersSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Título del quiz' },
                        questions: {
                            type: 'array',
                            description: 'Lista de preguntas del quiz',
                            items: {
                                type: 'object',
                                properties: {
                                    question: { type: 'string', description: 'Texto de la pregunta' },
                                    options: {
                                        type: 'array',
                                        description: 'Opciones de respuesta',
                                        items: { type: 'string' }
                                    },
                                    correctIndex: {
                                        type: 'integer',
                                        description: 'Índice de la respuesta correcta (0-based)'
                                    },
                                    explanation: {
                                        type: 'string',
                                        description: 'Explicación de la respuesta correcta (opcional)'
                                    }
                                },
                                required: ['question', 'options', 'correctIndex']
                            }
                        }
                    },
                    required: ['questions']
                }),
                executorType: 'builtin' as const,
                executorConfig: JSON.stringify({ handler: 'ui_renderer', componentKey: 'QuizCard', interactive: true }),
                requiresConfirmation: false,
                riskLevel: 'low' as const,
                isSystem: true,
                version: '1.0.0'
            },
            {
                name: 'render_flashcards',
                displayName: 'Mostrar Flashcards',
                description:
                    'Genera y muestra un mazo de flashcards interactivo directamente en el chat. Úsalo para ayudar al estudiante a memorizar conceptos, definiciones o vocabulario.',
                category: 'ui',
                parametersSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Título del mazo de flashcards' },
                        cards: {
                            type: 'array',
                            description: 'Lista de tarjetas de estudio',
                            items: {
                                type: 'object',
                                properties: {
                                    front: { type: 'string', description: 'Frente de la tarjeta (pregunta o término)' },
                                    back: { type: 'string', description: 'Reverso de la tarjeta (respuesta o definición)' }
                                },
                                required: ['front', 'back']
                            }
                        }
                    },
                    required: ['cards']
                }),
                executorType: 'builtin' as const,
                executorConfig: JSON.stringify({ handler: 'ui_renderer', componentKey: 'FlashcardDeck', interactive: true }),
                requiresConfirmation: false,
                riskLevel: 'low' as const,
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
