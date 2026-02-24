import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { ModelResolver } from '$lib/server/ai/services/ModelResolver';
import { UsageTracker } from '$lib/server/ai/services/UsageTracker';
import { RagService } from '$lib/server/ai/services/RagService';
import DBAgentUtils from '$lib/server/db/DBAgentUtils';
import { ToolManager } from './ToolManager';
import { ToolExecutor } from './ToolExecutor';
import { AgentPromptBuilder } from './AgentPromptBuilder';
import type { AgentContext, AgentStreamPart } from '$lib/types/agent';
import { nanoid } from 'nanoid';

/**
 * AgentEngine: motor agéntico desacoplado.
 *
 * Gestiona el bucle agéntico usando Vercel AI SDK v6 con:
 * - stopWhen: stepCountIs(n)  [no maxSteps]
 * - maxOutputTokens            [no maxTokens]
 * - tool `inputSchema`         [no parameters]
 * - event.text / event.input / event.output  [renombrados en v6]
 */
export class AgentEngine {
    static async *executeLoop(
        context: AgentContext,
        userMessage: string
    ): AsyncGenerator<AgentStreamPart> {
        const startTime = Date.now();
        let toolCallsCount = 0;

        // 1. Resolver modelo
        const config = context.activityConfig;
        const modelName = config.llmModel || (await ModelResolver.getDefaultModel()) || '';

        if (!modelName) {
            yield { type: 'error', code: 'NO_MODEL', message: 'No hay modelo de IA configurado para esta actividad.' };
            return;
        }

        // 2. Verificar quota
        const quotaCheck = await UsageTracker.checkQuota(
            modelName,
            context.userId,
            context.courseId,
            context.activityId
        );
        if (!quotaCheck.allowed) {
            yield { type: 'error', code: 'QUOTA_EXCEEDED', message: quotaCheck.reason ?? 'Cuota de uso alcanzada.' };
            return;
        }

        // 3. RAG
        let ragContext: string | null = null;
        if (config.ragEnabled && config.ragCollectionName) {
            try {
                const ragResult = await RagService.getRagContext(
                    userMessage, config.ragCollectionName, 5, 0.7
                );
                ragContext = ragResult?.context ?? null;
            } catch { /* continuar sin RAG */ }
        }

        // 4. System prompt
        const systemPrompt = AgentPromptBuilder.buildSystemPrompt(config, context.enabledTools, ragContext);

        // 5. Guardar mensaje usuario
        const userMsgId = await DBAgentUtils.saveAgentMessage({
            chatId: context.chatId,
            role: 'user',
            textContent: userMessage,
            sequenceOrder: 0
        });

        yield { type: 'status', status: 'thinking' };

        // 6. Historial de mensajes
        const messages: ModelMessage[] = [
            ...context.messageHistory.map((m): ModelMessage => {
                if (m.role === 'tool') {
                    return {
                        role: 'tool',
                        content: [{
                            type: 'tool-result',
                            toolCallId: m.toolCallId ?? '',
                            toolName: m.toolName ?? '',
                            // v6: output is ToolResultOutput — store as text (model handles JSON string)
                            output: { type: 'text', value: m.content ?? '' }
                        }]
                    };
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return { role: m.role, content: m.content } as any as ModelMessage;
            }),
            { role: 'user', content: userMessage }
        ];

        // 7. Construir herramientas para Vercel AI SDK
        const tools = ToolManager.buildVercelAITools(
            context.enabledTools,
            async (toolName, input) => {
                const result = await ToolExecutor.execute(toolName, input, context);
                return result.success ? result.data : { error: result.errorMessage };
            }
        );

        // 8. Cargar modelo
        let model;
        try {
            model = await ModelResolver.buildChatModel(modelName);
        } catch {
            yield { type: 'error', code: 'MODEL_ERROR', message: `No se pudo cargar el modelo "${modelName}".` };
            return;
        }

        // 9. Crear mensaje assistant vacío en BD para ir actualizándolo
        const assistantMsgId = await DBAgentUtils.saveAgentMessage({
            chatId: context.chatId,
            role: 'assistant',
            textContent: '',
            sequenceOrder: 1
        });

        let accumulatedText = '';

        try {
            const result = streamText({
                model,
                system: systemPrompt,
                messages,
                tools: Object.keys(tools).length > 0 ? tools : undefined,
                toolChoice: (config.toolChoice as 'auto' | 'required' | 'none') ?? 'auto',
                // v6: stopWhen (no maxSteps)
                stopWhen: stepCountIs(config.maxToolRoundtrips),
                temperature: config.temperature ?? 0.7,
                // v6: maxOutputTokens (no maxTokens)
                maxOutputTokens: config.maxTokens ?? 2000,
                onFinish: async (finishResult) => {
                    const durationMs = Date.now() - startTime;
                    try {
                        await UsageTracker.logUsage({
                            modelName,
                            userId: context.userId,
                            courseId: context.courseId,
                            interactiveLearningId: context.activityId,
                            chatId: context.chatId,
                            operation: 'chat',
                            inputTokens: finishResult.usage?.inputTokens ?? 0,
                            outputTokens: finishResult.usage?.outputTokens ?? 0,
                            durationMs,
                            success: true,
                            metadata: { toolCallsCount, ragEnabled: config.ragEnabled, agentMode: true }
                        });
                    } catch { /* no romper el flujo */ }
                }
            });

            // 10. Procesar el stream de eventos
            for await (const event of result.fullStream) {
                switch (event.type) {
                    case 'text-delta':
                        // v6: event.text (no event.textDelta)
                        accumulatedText += event.text;
                        yield { type: 'text-delta', text: event.text };
                        break;

                    case 'tool-call': {
                        toolCallsCount++;
                        const toolDef = context.enabledTools.find(t => t.name === event.toolName);
                        const toolCallId = event.toolCallId;

                        // v6: event.input (no event.args)
                        const toolInput = event.input as Record<string, unknown>;

                        await DBAgentUtils.saveToolCall({
                            id: toolCallId,
                            messageId: assistantMsgId,
                            toolName: event.toolName,
                            toolDefinitionId: toolDef?.id,
                            arguments: JSON.stringify(toolInput),
                            status: 'executing'
                        });

                        yield {
                            type: 'tool-call-start',
                            toolCallId,
                            toolName: event.toolName,
                            toolDisplayName: toolDef?.displayName ?? event.toolName,
                            args: toolInput
                        };

                        yield {
                            type: 'tool-call-delta',
                            toolCallId,
                            status: 'executing',
                            progressText: `Ejecutando ${toolDef?.displayName ?? event.toolName}...`
                        };
                        break;
                    }

                    case 'tool-result': {
                        const toolCallId = event.toolCallId;
                        const toolDef = context.enabledTools.find(t => t.name === event.toolName);

                        // v6: event.output (no event.result)
                        const toolOutput = event.output as Record<string, unknown> | null;
                        const isError = toolOutput !== null && typeof toolOutput === 'object' && 'error' in toolOutput;

                        await DBAgentUtils.updateToolCall(toolCallId, {
                            result: JSON.stringify(toolOutput),
                            status: isError ? 'failed' : 'completed',
                            errorMessage: isError ? (toolOutput?.error as string) : undefined
                        });

                        await DBAgentUtils.saveAgentMessage({
                            chatId: context.chatId,
                            role: 'tool',
                            textContent: JSON.stringify(toolOutput),
                            toolCallId,
                            toolName: event.toolName,
                            sequenceOrder: 2
                        });

                        yield {
                            type: 'tool-result',
                            toolCallId,
                            toolName: event.toolName,
                            result: toolOutput,
                            displayResult: isError ? `Error: ${toolOutput?.error}` : undefined,
                            status: isError ? 'failed' : 'completed',
                            durationMs: 0
                        };
                        break;
                    }

                    case 'error':
                        yield {
                            type: 'error',
                            code: 'STREAM_ERROR',
                            message: event.error instanceof Error ? event.error.message : 'Error en el stream del agente'
                        };
                        break;
                }
            }

            // 11. Actualizar mensaje del assistant con el texto final
            await DBAgentUtils.updateAgentMessage(assistantMsgId, {
                textContent: accumulatedText,
                finishReason: 'stop'
            });

            // 12. Métricas finales
            const finalUsage = await result.usage;

            yield {
                type: 'done',
                usage: {
                    inputTokens: finalUsage?.inputTokens ?? 0,
                    outputTokens: finalUsage?.outputTokens ?? 0,
                    totalTokens: (finalUsage?.inputTokens ?? 0) + (finalUsage?.outputTokens ?? 0),
                    toolCallsCount
                },
                finishReason: (await result.finishReason) ?? 'stop'
            };

        } catch (error) {
            yield {
                type: 'error',
                code: 'ENGINE_ERROR',
                message: error instanceof Error ? error.message : 'Error inesperado en el motor agéntico'
            };
        }
    }
}
