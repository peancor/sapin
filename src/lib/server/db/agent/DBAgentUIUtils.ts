import { db } from '..';
import { eq, and, asc } from 'drizzle-orm';
import * as schema from '../schema';
import { nanoid } from 'nanoid';

export default class DBAgentUIUtils {
    // ─── Catálogo Global de Componentes UI (Admin) ───

    static async getAllUIComponents() {
        return await db
            .select()
            .from(schema.agentUIComponent)
            .orderBy(asc(schema.agentUIComponent.category), asc(schema.agentUIComponent.name));
    }

    static async getUIComponentById(id: string) {
        const [record] = await db
            .select()
            .from(schema.agentUIComponent)
            .where(eq(schema.agentUIComponent.id, id));
        return record ?? null;
    }

    static async getUIComponentByName(name: string) {
        const [record] = await db
            .select()
            .from(schema.agentUIComponent)
            .where(eq(schema.agentUIComponent.name, name));
        return record ?? null;
    }

    static async getUIComponentByKey(componentKey: string) {
        const [record] = await db
            .select()
            .from(schema.agentUIComponent)
            .where(eq(schema.agentUIComponent.componentKey, componentKey));
        return record ?? null;
    }

    static async createUIComponent(
        data: Omit<typeof schema.agentUIComponent.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
    ) {
        const id = nanoid();
        await db.insert(schema.agentUIComponent).values({
            id,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return id;
    }

    static async updateUIComponent(
        id: string,
        data: Partial<typeof schema.agentUIComponent.$inferInsert>
    ) {
        await db
            .update(schema.agentUIComponent)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(schema.agentUIComponent.id, id));
    }

    static async deleteUIComponent(id: string) {
        await db
            .delete(schema.agentUIComponent)
            .where(and(eq(schema.agentUIComponent.id, id), eq(schema.agentUIComponent.isSystem, false)));
    }

    // ─── Instancias de UI ───

    static async saveUIInstance(data: {
        id?: string;
        messageId: string;
        uiComponentId: string;
        componentKey: string;
        props: string;
        metadata?: string;
    }): Promise<string> {
        const id = data.id ?? nanoid();
        await db.insert(schema.agentUIInstance).values({
            id,
            messageId: data.messageId,
            uiComponentId: data.uiComponentId,
            props: data.props,
            metadata: data.metadata ?? JSON.stringify({ componentKey: data.componentKey }),
            createdAt: new Date()
        });
        return id;
    }

    static async getUIInstance(instanceId: string) {
        const [record] = await db
            .select()
            .from(schema.agentUIInstance)
            .where(eq(schema.agentUIInstance.id, instanceId));
        return record ?? null;
    }

    static async updateUIInstance(
        instanceId: string,
        data: Partial<typeof schema.agentUIInstance.$inferInsert>
    ) {
        await db
            .update(schema.agentUIInstance)
            .set(data)
            .where(eq(schema.agentUIInstance.id, instanceId));
    }

    // ─── Seed de Componentes UI builtin ───

    static async seedBuiltinUIComponents() {
        const builtinUIComponents = [
            {
                name: 'quiz_card',
                displayName: 'Quiz Interactivo',
                description: 'Componente de preguntas de opción múltiple para evaluar comprensión del estudiante.',
                category: 'evaluation',
                componentKey: 'QuizCard',
                propsSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Título del quiz' },
                        questions: {
                            type: 'array',
                            description: 'Lista de preguntas del quiz',
                            items: {
                                type: 'object',
                                properties: {
                                    question: { type: 'string' },
                                    options: { type: 'array', items: { type: 'string' } },
                                    correctIndex: { type: 'integer' },
                                    explanation: { type: 'string' }
                                },
                                required: ['question', 'options', 'correctIndex']
                            }
                        }
                    },
                    required: ['questions']
                }),
                responseSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        answers: { type: 'array', items: { type: 'integer' } },
                        score: { type: 'number' },
                        completed: { type: 'boolean' }
                    }
                }),
                isSystem: true,
                version: '1.0.0'
            },
            {
                name: 'flashcard_deck',
                displayName: 'Mazo de Flashcards',
                description: 'Tarjetas de estudio interactivas para memorizar conceptos y definiciones.',
                category: 'practice',
                componentKey: 'FlashcardDeck',
                propsSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Título del mazo' },
                        cards: {
                            type: 'array',
                            description: 'Lista de tarjetas de estudio',
                            items: {
                                type: 'object',
                                properties: {
                                    front: { type: 'string' },
                                    back: { type: 'string' }
                                },
                                required: ['front', 'back']
                            }
                        }
                    },
                    required: ['cards']
                }),
                responseSchema: JSON.stringify({
                    type: 'object',
                    properties: {
                        cardsReviewed: { type: 'integer' },
                        completed: { type: 'boolean' }
                    }
                }),
                isSystem: true,
                version: '1.0.0'
            }
        ];

        for (const component of builtinUIComponents) {
            const existing = await this.getUIComponentByName(component.name);
            if (!existing) {
                await this.createUIComponent(component);
            }
        }
    }
}
