import { generateText, streamText, type ModelMessage } from 'ai';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { notifier } from '$lib/server/notifier';
import { getPublicAppUrl } from '$lib/server/utils/publicUrl';
import { ModelResolver } from './services/ModelResolver';
import { UsageTracker } from './services/UsageTracker';
import { SystemPromptBuilder } from './services/SystemPromptBuilder';
import { RagService, type RagContextOptions } from './services/RagService';
import { resolveRagConfig } from '$lib/server/rag/config';

export class AIUtils {
	public static async getSetting(key: string, defaultValue: string = ''): Promise<string> {
		const result = await db.select().from(table.appSetting).where(eq(table.appSetting.key, key));
		return result[0]?.value ?? defaultValue;
	}

	/**
	 * Obtiene los modelos disponibles desde la base de datos
	 * Si no hay modelos en BD, usa los hardcoded como fallback
	 */
	public static async getAvailableModels() {
		return ModelResolver.getAvailableModels();
	}

	/**
	 * Obtiene el modelo predeterminado desde la BD
	 */
	public static async getDefaultModel() {
		return ModelResolver.getDefaultModel();
	}

	private static async buildChatModel(model: string) {
		return ModelResolver.buildChatModel(model);
	}

	/**
	 * Verifica si se puede usar el modelo según las cuotas configuradas
	 */
	public static async checkQuota(
		modelName: string,
		userId?: string,
		courseId?: string,
		interactiveLearningId?: string
	) {
		return UsageTracker.checkQuota(modelName, userId, courseId, interactiveLearningId);
	}

	/**
	 * Registra el uso de IA
	 */
	public static async logUsage(params: {
		modelName: string;
		userId?: string;
		courseId?: string;
		interactiveLearningId?: string;
		chatId?: string;
		operation: 'chat' | 'completion' | 'image' | 'embedding';
		inputTokens: number;
		outputTokens: number;
		durationMs?: number;
		success?: boolean;
		errorMessage?: string;
		metadata?: Record<string, unknown>;
	}) {
		return UsageTracker.logUsage(params);
	}

    public static async streamTextFromPrompt(
        prompt: string, 
        modelName: string,
        context?: { userId?: string; courseId?: string; interactiveLearningId?: string; chatId?: string }
    ) {
        return this.streamTextFromMessages([{role: 'user', content: prompt}], modelName, context);
    }

    public static async streamTextFromMessages(
        messages: ModelMessage[], 
        modelName: string,
        context?: { userId?: string; courseId?: string; interactiveLearningId?: string; chatId?: string }
    ) {
        // Verificar cuota antes de proceder
        const quotaCheck = await this.checkQuota(
            modelName, 
            context?.userId, 
            context?.courseId, 
            context?.interactiveLearningId
        );
        
        if (!quotaCheck.allowed) {
            throw new Error(`Cuota excedida: ${quotaCheck.reason}`);
        }

        const model = await this.buildChatModel(modelName);
        const startTime = Date.now();

        const result = streamText({
            model,
            messages,
            temperature: 0.7,
            onFinish: async (finishResult) => {
                const durationMs = Date.now() - startTime;
                
                // Registrar uso - AI SDK usa inputTokens/outputTokens
                const usage = finishResult.usage;
                const inputTokens = usage?.inputTokens ?? 0;
                const outputTokens = usage?.outputTokens ?? 0;
                
                // Metadata con campos adicionales de uso
                const metadata: Record<string, unknown> = {
                    totalTokens: usage?.totalTokens,
                    reasoningTokens: usage?.reasoningTokens,
                    cachedInputTokens: usage?.cachedInputTokens
                };

                await this.logUsage({
                    modelName,
                    userId: context?.userId,
                    courseId: context?.courseId,
                    interactiveLearningId: context?.interactiveLearningId,
                    chatId: context?.chatId,
                    operation: 'chat',
                    inputTokens,
                    outputTokens,
                    durationMs,
                    success: true,
                    metadata
                });

                console.log('AI Usage logged:', {
                    model: modelName,
                    tokens: finishResult.usage,
                    duration: durationMs
                });
            }
        });
        return result;
    }

    public static async generateText(
        prompt: string, 
        modelName: string,
        context?: { userId?: string; courseId?: string; interactiveLearningId?: string }
    ) {
        // Verificar cuota
        const quotaCheck = await this.checkQuota(
            modelName, 
            context?.userId, 
            context?.courseId, 
            context?.interactiveLearningId
        );
        
        if (!quotaCheck.allowed) {
            throw new Error(`Cuota excedida: ${quotaCheck.reason}`);
        }

        const model = await this.buildChatModel(modelName);
        const startTime = Date.now();

        try {
            const result = await generateText({
                model,
                prompt,
            });

            const durationMs = Date.now() - startTime;

            // Registrar uso - AI SDK usa inputTokens/outputTokens
            const usage = result.usage;
            const inputTokens = usage?.inputTokens ?? 0;
            const outputTokens = usage?.outputTokens ?? 0;
            
            // Metadata con campos adicionales de uso
            const metadata: Record<string, unknown> = {
                totalTokens: usage?.totalTokens,
                reasoningTokens: usage?.reasoningTokens,
                cachedInputTokens: usage?.cachedInputTokens
            };

            await this.logUsage({
                modelName,
                userId: context?.userId,
                courseId: context?.courseId,
                interactiveLearningId: context?.interactiveLearningId,
                operation: 'completion',
                inputTokens,
                outputTokens,
                durationMs,
                success: true,
                metadata
            });

            return result.text;
        } catch (error) {
            const durationMs = Date.now() - startTime;

            // Registrar error
            await this.logUsage({
                modelName,
                userId: context?.userId,
                courseId: context?.courseId,
                interactiveLearningId: context?.interactiveLearningId,
                operation: 'completion',
                inputTokens: 0,
                outputTokens: 0,
                durationMs,
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown error'
            });

            throw error;
        }
    }

    // ==================== Chat Utilities ====================

    public static async saveMessage(
        chatId: string,
        content: string,
        type: keyof typeof table.messageType,
        metadata?: string
    ) {
        return await db.insert(table.message).values({
            id: nanoid(),
            chatId,
            content,
            type,
            tokenCount: 0,
            finishReason: 'stop',
            metadata,
            createdAt: new Date()
        });
    }

    public static async getInteractiveLearningChat(iid: string) {
        return await db
            .select()
            .from(table.interactiveLearningChat)
            .where(eq(table.interactiveLearningChat.id, iid))
            .get();
    }

    /**
     * Obtiene el courseId asociado a un interactiveLearning si existe
     */
    public static async getCourseIdByInteractiveLearningId(interactiveLearningId: string): Promise<string | undefined> {
        const result = await db
            .select({ courseId: table.courseInteractiveLearning.courseId })
            .from(table.courseInteractiveLearning)
            .where(eq(table.courseInteractiveLearning.interactiveLearningId, interactiveLearningId))
            .get();
        return result?.courseId;
    }

    public static async getCourseNamesByInteractiveLearningId(interactiveLearningId: string): Promise<string[]> {
        const rows = await db
            .select({ name: table.course.name })
            .from(table.courseInteractiveLearning)
            .innerJoin(table.course, eq(table.course.id, table.courseInteractiveLearning.courseId))
            .where(eq(table.courseInteractiveLearning.interactiveLearningId, interactiveLearningId))
            .orderBy(table.courseInteractiveLearning.order)
            .all();

        return [...new Set(rows.map((row) => row.name).filter(Boolean))];
    }

    public static async getPreviousMessages(ilcid: string, cid: string): Promise<ModelMessage[]> {
        const chatMessages = await db
            .select()
            .from(table.message)
            .where(eq(table.message.chatId, cid))
            .orderBy(table.message.createdAt)
            .all();

        return chatMessages.map((msg) => {
            switch (msg.type) {
                case 'USER':
                    return { role: 'user' as const, content: msg.content };
                case 'ASSISTANT':
                    return { role: 'assistant' as const, content: msg.content };
                case 'SYSTEM':
                    return { role: 'system' as const, content: msg.content };
                default:
                    return { role: 'user' as const, content: msg.content };
            }
        });
    }

    public static async getModelFromInteractiveLearningChat(iid: string) {
        const chatConfig = await this.getInteractiveLearningChat(iid);
        if (!chatConfig) throw new Error(`No chat found with id ${iid}`);

        // Usar el modelo configurado en la actividad, o el por defecto del sistema
        const configuredModel = chatConfig.llmModel || '';
        
        // Verificar si el modelo configurado está disponible en el nuevo sistema
        const availableModels = await this.getAvailableModels();
        const isModelAvailable = availableModels.some(m => m.name === configuredModel);
        
        const chosenModel = isModelAvailable 
            ? configuredModel 
            : await this.getDefaultModel();

        return {
            model: await this.buildChatModel(chosenModel),
            temperature: chatConfig.temperature ?? 0.7,
            chatConfig,
            modelName: chosenModel
        };
    }

    public static buildSystemPrompt(
        role: string | null,
        instructions: string | null,
        context: string | null,
        systemPrompt: string | null,
        ragContext: string | null = null,
        isRagEnabled: boolean = false
    ): string {
        return SystemPromptBuilder.buildSystemPrompt(
            role,
            instructions,
            context,
            systemPrompt,
            ragContext,
            isRagEnabled
        );
    }

    public static getDefaultSystemPromptTemplateText(isRagEnabled: boolean = false): string {
        return SystemPromptBuilder.getDefaultSystemPromptTemplateText(isRagEnabled);
    }

    /**
     * Obtiene contexto relevante de Qdrant para RAG
     */
    public static async getRagContext(
        query: string,
        collectionName: string,
        topK: number = 5,
        minScore: number = 0.7,
        opts?: RagContextOptions
    ): Promise<{ context: string; sources: Array<{ source: string; score: number }> } | null> {
        return RagService.getRagContext(query, collectionName, topK, minScore, opts);
    }

    public static async streamChatResponse(
        ilcid: string,
        cid: string,
        userMessage: string,
        userId?: string
    ) {
        const { model, temperature, chatConfig, modelName } = await this.getModelFromInteractiveLearningChat(ilcid);
        const ragConfig = resolveRagConfig(chatConfig.ragConfig);

        // Obtener el courseId asociado al interactiveLearning (el id del chat ES el interactiveLearningId)
        const courseId = await this.getCourseIdByInteractiveLearningId(chatConfig.id);

        // Obtener contexto RAG si está habilitado
        let ragContext: string | null = null;
        if (chatConfig.ragEnabled && chatConfig.ragCollectionName) {
            console.log(`[RAG] Fetching context for chat ${ilcid} from collection ${chatConfig.ragCollectionName}`);
            
            const ragResult = await this.getRagContext(
                userMessage,
                chatConfig.ragCollectionName,
                ragConfig.topK,
                ragConfig.minScore,
                {
                    maxChars: ragConfig.contextMaxChars,
                    mergeAdjacentChunks: ragConfig.mergeAdjacentChunks,
                    adjacencyWindow: ragConfig.adjacencyWindow,
                    perSourceMaxBlocks: ragConfig.perSourceMaxBlocks,
                    fallbackMinScore: ragConfig.fallbackMinScore
                }
            );

            if (ragResult) {
                ragContext = ragResult.context;
                console.log(`[RAG] Found ${ragResult.sources.length} relevant sources`);
            } else {
                console.log(`[RAG] No relevant context found`);
            }
        }

        const systemPrompt = this.buildSystemPrompt(
            chatConfig.llmRole,
            chatConfig.llmInstructions,
            chatConfig.llmContext,
            chatConfig.systemPrompt,
            ragContext,
            !!chatConfig.ragEnabled
        );
        console.log('[RAG] System prompt size', {
            interactiveLearningId: chatConfig.id,
            characters: systemPrompt.length,
            approxTokens: Math.ceil(systemPrompt.length / 4),
            ragCharacters: ragContext?.length ?? 0,
            ragApproxTokens: ragContext ? Math.ceil(ragContext.length / 4) : 0
        });

        const previousMessages = await this.getPreviousMessages(ilcid, cid);

        const messages: ModelMessage[] = [
            { role: 'system', content: systemPrompt },
            ...previousMessages,
            { role: 'user', content: userMessage }
        ];

        // Verificar cuota usando el modelName del resultado (el id del chat ES el interactiveLearningId)
        const quotaCheck = await this.checkQuota(
            modelName,
            userId,
            courseId,
            chatConfig.id
        );

        if (!quotaCheck.allowed) {
            throw new Error(`Cuota excedida: ${quotaCheck.reason}`);
        }

        const startTime = Date.now();

        return streamText({
            model,
            messages,
            temperature,
            onFinish: async (finishResult) => {
                const durationMs = Date.now() - startTime;

                // Registrar uso - AI SDK usa inputTokens/outputTokens
                const usage = finishResult.usage;
                const inputTokens = usage?.inputTokens ?? 0;
                const outputTokens = usage?.outputTokens ?? 0;
                
                // Metadata con campos adicionales de uso
                const metadata: Record<string, unknown> = {
                    totalTokens: usage?.totalTokens,
                    reasoningTokens: usage?.reasoningTokens,
                    cachedInputTokens: usage?.cachedInputTokens,
                    ragEnabled: chatConfig.ragEnabled,
                    ragContextUsed: ragContext !== null
                };

                await this.logUsage({
                    modelName,
                    userId,
                    courseId,
                    interactiveLearningId: chatConfig.id, // El id del chat ES el interactiveLearningId
                    chatId: cid,
                    operation: 'chat',
                    inputTokens,
                    outputTokens,
                    durationMs,
                    success: true,
                    metadata
                });
            }
        });
    }

    public static async notifyEndOfChat(chatId: string, ilcid: string, userId: string) {
        const [chat] = await db.select().from(table.chat).where(eq(table.chat.id, chatId));
        if (!chat) return;

        const [user] = await db.select().from(table.user).where(eq(table.user.id, userId));
        if (!user) return;

        const [interactiveLearningChat] = await db
            .select()
            .from(table.interactiveLearningChat)
            .where(eq(table.interactiveLearningChat.id, ilcid));
        if (!interactiveLearningChat) return;

        const [interactiveLearning] = await db
            .select()
            .from(table.interactiveLearning)
            .where(eq(table.interactiveLearning.id, interactiveLearningChat.id)); // El id del chat ES el interactiveLearningId
        if (!interactiveLearning) return;

        const courseNames = await this.getCourseNamesByInteractiveLearningId(interactiveLearning.id);

        const userName = user.username || user.email;
        const chatViewLink = `${getPublicAppUrl()}/interactive-chat/${interactiveLearning.id}/view/${chat.id}`;
        const courseLine =
            courseNames.length > 0 ? `\n📚 Curso: ${courseNames[0]}` : '\n📚 Curso: Sin curso asociado';

        notifier.notify(
            `📝 Nuevo chat finalizado\n🧩 Actividad: ${interactiveLearning.name}${courseLine}\n👤 Usuario: ${userName}\n\n🔗 Ver chat: ${chatViewLink}`
        );
    }

    public static async notifyEndOfAgentChat(chatId: string, activityId: string, userId: string) {
        const [chat] = await db.select().from(table.chat).where(eq(table.chat.id, chatId));
        if (!chat) return;

        const [user] = await db.select().from(table.user).where(eq(table.user.id, userId));
        if (!user) return;

        const [interactiveLearning] = await db
            .select()
            .from(table.interactiveLearning)
            .where(eq(table.interactiveLearning.id, activityId));
        if (!interactiveLearning) return;

        const courseNames = await this.getCourseNamesByInteractiveLearningId(interactiveLearning.id);

        const userName = user.username || user.email;
        const chatViewLink = `${getPublicAppUrl()}/agent-chat/${interactiveLearning.id}/c/${chat.id}`;
        const courseLine =
            courseNames.length > 0 ? `\n📚 Curso: ${courseNames[0]}` : '\n📚 Curso: Sin curso asociado';

        notifier.notify(
            `🤖 Nuevo chat de agente finalizado\n🧩 Actividad: ${interactiveLearning.name}${courseLine}\n👤 Usuario: ${userName}\n\n🔗 Ver chat: ${chatViewLink}`
        );
    }

    /**
        * Check if a response contains [[DONE]] marker and if there is no previous DONE
        * in persisted assistant messages for the same chat.
     */
    public static async isFirstDoneMessage(cid: string, currentResponse: string): Promise<boolean> {
        if (!currentResponse.includes('[[DONE]]')) return false;

        const previousMessages = await db
            .select()
            .from(table.message)
            .where(eq(table.message.chatId, cid))
            .all();

        return !previousMessages.some(
            (msg) => msg.type === 'ASSISTANT' && msg.content.includes('[[DONE]]')
        );
    }
}

