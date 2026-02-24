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

/** Sentinel emitido por herramientas de tipo ui_renderer */
interface UISentinel {
    __uiComponent: true;
    instanceId: string;
    componentKey: string;
    props: Record<string, unknown>;
    interactive: boolean;
}

function isUISentinel(value: unknown): value is UISentinel {
    return (
        typeof value === 'object' &&
        value !== null &&
        '__uiComponent' in value &&
        (value as Record<string, unknown>).__uiComponent === true
    );
}

/** Sentinel emitido por la función execute de una herramienta con requiresConfirmation */
interface HitlSentinel {
    __hitl: true;
    toolCallId: string;
    toolName: string;
    toolDisplayName: string;
    riskLevel: 'low' | 'medium' | 'high';
    args: Record<string, unknown>;
}

function isHitlSentinel(value: unknown): value is HitlSentinel {
    return (
        typeof value === 'object' &&
        value !== null &&
        '__hitl' in value &&
        (value as Record<string, unknown>).__hitl === true
    );
}

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

    /**
     * Construye el array de ModelMessage desde el historial de la BD (para nuevas sesiones).
     */
    private static buildMessagesFromHistory(context: AgentContext, userMessage: string): ModelMessage[] {
        return [
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
    }

    /**
     * Construye las herramientas con soporte HITL.
     * Para herramientas con requiresConfirmation, el execute retorna un sentinel
     * en lugar de ejecutar la herramienta real.
     */
    private static buildTools(context: AgentContext, assistantMsgId: string) {
        return ToolManager.buildVercelAITools(
            context.enabledTools,
            async (toolName, input, toolCallId) => {
                const toolDef = context.enabledTools.find(t => t.name === toolName);

                // ─── UI Renderer ───
                if (toolDef?.executorType === 'builtin' && toolDef?.executorConfig?.handler === 'ui_renderer') {
                    const componentKey = toolDef.executorConfig.componentKey as string;
                    const interactive = (toolDef.executorConfig.interactive as boolean) ?? false;
                    const instanceId = nanoid();

                    const uiComp = await DBAgentUtils.getUIComponentByKey(componentKey);
                    if (uiComp) {
                        await DBAgentUtils.saveUIInstance({
                            id: instanceId,
                            messageId: assistantMsgId,
                            uiComponentId: uiComp.id,
                            componentKey,
                            props: JSON.stringify(input)
                        });
                    }

                    return {
                        __uiComponent: true,
                        instanceId,
                        componentKey,
                        props: input,
                        interactive
                    } satisfies UISentinel;
                }

                if (toolDef?.requiresConfirmation) {
                    // Marcar como awaiting_confirmation (ya fue guardado como 'executing' en tool-call event)
                    await DBAgentUtils.updateToolCall(toolCallId, { status: 'awaiting_confirmation' });

                    return {
                        __hitl: true,
                        toolCallId,
                        toolName,
                        toolDisplayName: toolDef.displayName,
                        riskLevel: toolDef.riskLevel,
                        args: input
                    } satisfies HitlSentinel;
                }

                const result = await ToolExecutor.execute(toolName, input, context);
                return result.success ? result.data : { error: result.errorMessage };
            }
        );
    }

    /**
     * Procesa el fullStream de streamText y emite AgentStreamPart.
     * Retorna true si el stream terminó normalmente, false si se activó HITL.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static async *processStream(
        result: any,
        context: AgentContext,
        assistantMsgId: string,
        accumulated: { text: string; toolCallsCount: number }
    ): AsyncGenerator<AgentStreamPart> {
        let hitlTriggered = false;

        for await (const event of result.fullStream) {
            switch (event.type) {
                case 'text-delta':
                    accumulated.text += event.text;
                    yield { type: 'text-delta', text: event.text };
                    break;

                case 'tool-call': {
                    accumulated.toolCallsCount++;
                    const toolDef = context.enabledTools.find(t => t.name === event.toolName);
                    const toolCallId = event.toolCallId;
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
                    const toolOutput = event.output as unknown;

                    // ─── Detección de UI Component ───
                    if (isUISentinel(toolOutput)) {
                        yield {
                            type: 'ui-component',
                            instanceId: toolOutput.instanceId,
                            componentKey: toolOutput.componentKey,
                            props: toolOutput.props,
                            interactive: toolOutput.interactive
                        };

                        const cleanResult = {
                            rendered: true,
                            componentKey: toolOutput.componentKey,
                            instanceId: toolOutput.instanceId
                        };

                        await DBAgentUtils.updateToolCall(toolCallId, {
                            result: JSON.stringify(cleanResult),
                            status: 'completed'
                        });

                        await DBAgentUtils.saveAgentMessage({
                            chatId: context.chatId,
                            role: 'tool',
                            textContent: JSON.stringify(cleanResult),
                            toolCallId,
                            toolName: event.toolName,
                            sequenceOrder: 2
                        });

                        break;
                    }

                    // ─── Detección de HITL ───
                    if (isHitlSentinel(toolOutput)) {
                        // Guardar el texto acumulado hasta ahora en el mensaje del assistant
                        await DBAgentUtils.updateAgentMessage(assistantMsgId, {
                            textContent: accumulated.text,
                            finishReason: 'hitl'
                        });

                        yield {
                            type: 'tool-confirm-required',
                            toolCallId: toolOutput.toolCallId,
                            toolName: toolOutput.toolName,
                            toolDisplayName: toolOutput.toolDisplayName,
                            args: toolOutput.args,
                            riskLevel: toolOutput.riskLevel,
                            confirmationMessage: `¿Autorizar la ejecución de "${toolOutput.toolDisplayName}"?`
                        };

                        hitlTriggered = true;
                        break; // break del switch
                    }

                    // ─── Tool result normal ───
                    const toolOutputObj = toolOutput as Record<string, unknown> | null;
                    const isError = toolOutputObj !== null && typeof toolOutputObj === 'object' && 'error' in toolOutputObj;

                    await DBAgentUtils.updateToolCall(toolCallId, {
                        result: JSON.stringify(toolOutput),
                        status: isError ? 'failed' : 'completed',
                        errorMessage: isError ? (toolOutputObj?.error as string) : undefined
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
                        displayResult: isError ? `Error: ${toolOutputObj?.error}` : undefined,
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

            if (hitlTriggered) break; // break del for..of
        }
    }

    // ─────────────────────────────────────────────────────────
    // LOOP PRINCIPAL (nueva sesión o mensaje de usuario normal)
    // ─────────────────────────────────────────────────────────
    static async *executeLoop(
        context: AgentContext,
        userMessage: string
    ): AsyncGenerator<AgentStreamPart> {
        const startTime = Date.now();

        // 1. Resolver modelo
        const config = context.activityConfig;
        const modelName = config.llmModel || (await ModelResolver.getDefaultModel()) || '';

        if (!modelName) {
            yield { type: 'error', code: 'NO_MODEL', message: 'No hay modelo de IA configurado para esta actividad.' };
            return;
        }

        // 2. Verificar quota
        const quotaCheck = await UsageTracker.checkQuota(modelName, context.userId, context.courseId, context.activityId);
        if (!quotaCheck.allowed) {
            yield { type: 'error', code: 'QUOTA_EXCEEDED', message: quotaCheck.reason ?? 'Cuota de uso alcanzada.' };
            return;
        }

        // 3. RAG
        let ragContext: string | null = null;
        if (config.ragEnabled && config.ragCollectionName) {
            try {
                const ragResult = await RagService.getRagContext(userMessage, config.ragCollectionName, 5, 0.7);
                ragContext = ragResult?.context ?? null;
            } catch { /* continuar sin RAG */ }
        }

        // 4. System prompt
        const systemPrompt = AgentPromptBuilder.buildSystemPrompt(config, context.enabledTools, ragContext);

        // 5. Guardar mensaje usuario
        await DBAgentUtils.saveAgentMessage({
            chatId: context.chatId,
            role: 'user',
            textContent: userMessage,
            sequenceOrder: 0
        });

        yield { type: 'status', status: 'thinking' };

        // 6. Historial de mensajes
        const messages = this.buildMessagesFromHistory(context, userMessage);

        // 7. Cargar modelo
        let model;
        try {
            model = await ModelResolver.buildChatModel(modelName);
        } catch {
            yield { type: 'error', code: 'MODEL_ERROR', message: `No se pudo cargar el modelo "${modelName}".` };
            return;
        }

        // 8. Crear mensaje assistant vacío en BD
        const assistantMsgId = await DBAgentUtils.saveAgentMessage({
            chatId: context.chatId,
            role: 'assistant',
            textContent: '',
            sequenceOrder: 1
        });

        const accumulated = { text: '', toolCallsCount: 0 };

        try {
            const result = streamText({
                model,
                system: systemPrompt,
                messages,
                tools: Object.keys(this.buildTools(context, assistantMsgId)).length > 0
                    ? this.buildTools(context, assistantMsgId)
                    : undefined,
                toolChoice: (config.toolChoice as 'auto' | 'required' | 'none') ?? 'auto',
                stopWhen: stepCountIs(config.maxToolRoundtrips),
                temperature: config.temperature ?? 0.7,
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
                            metadata: { toolCallsCount: accumulated.toolCallsCount, ragEnabled: config.ragEnabled, agentMode: true }
                        });
                    } catch { /* no romper el flujo */ }
                }
            });

            // Procesar stream y detectar HITL
            let hitlDetected = false;
            for await (const part of this.processStream(result, context, assistantMsgId, accumulated)) {
                yield part;
                if (part.type === 'tool-confirm-required') {
                    hitlDetected = true;
                }
            }

            if (!hitlDetected) {
                // Flujo normal: actualizar mensaje del assistant y emitir done
                await DBAgentUtils.updateAgentMessage(assistantMsgId, {
                    textContent: accumulated.text,
                    finishReason: 'stop'
                });

                const finalUsage = await result.usage;
                yield {
                    type: 'done',
                    usage: {
                        inputTokens: finalUsage?.inputTokens ?? 0,
                        outputTokens: finalUsage?.outputTokens ?? 0,
                        totalTokens: (finalUsage?.inputTokens ?? 0) + (finalUsage?.outputTokens ?? 0),
                        toolCallsCount: accumulated.toolCallsCount
                    },
                    finishReason: (await result.finishReason) ?? 'stop'
                };
            }
            // Si hitlDetected: el stream se cierra sin 'done'. El frontend lo espera.

        } catch (error) {
            yield {
                type: 'error',
                code: 'ENGINE_ERROR',
                message: error instanceof Error ? error.message : 'Error inesperado en el motor agéntico'
            };
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // RESUME (después de confirmación HITL)
    // Carga el historial completo desde BD (incluye tool result ya guardado)
    // y continúa el loop sin un nuevo mensaje de usuario.
    // ─────────────────────────────────────────────────────────────────────
    static async *resumeFromToolCall(
        context: AgentContext
    ): AsyncGenerator<AgentStreamPart> {
        const startTime = Date.now();

        const config = context.activityConfig;
        const modelName = config.llmModel || (await ModelResolver.getDefaultModel()) || '';

        if (!modelName) {
            yield { type: 'error', code: 'NO_MODEL', message: 'No hay modelo de IA configurado.' };
            return;
        }

        // Reconstruir historial completo desde BD (incluye AssistantMessage con ToolCallPart + ToolResultMessage)
        const messages = await DBAgentUtils.getAgentMessagesAsModelMessages(context.chatId);

        if (messages.length === 0) {
            yield { type: 'error', code: 'RESUME_ERROR', message: 'No se pudo reconstruir el historial.' };
            return;
        }

        const systemPrompt = AgentPromptBuilder.buildSystemPrompt(config, context.enabledTools, null);

        let model;
        try {
            model = await ModelResolver.buildChatModel(modelName);
        } catch {
            yield { type: 'error', code: 'MODEL_ERROR', message: `No se pudo cargar el modelo "${modelName}".` };
            return;
        }

        // Crear nuevo mensaje assistant para la respuesta de continuación
        const assistantMsgId = await DBAgentUtils.saveAgentMessage({
            chatId: context.chatId,
            role: 'assistant',
            textContent: '',
            sequenceOrder: 99
        });

        const accumulated = { text: '', toolCallsCount: 0 };

        yield { type: 'status', status: 'thinking' };

        try {
            const result = streamText({
                model,
                system: systemPrompt,
                messages,
                tools: Object.keys(this.buildTools(context, assistantMsgId)).length > 0
                    ? this.buildTools(context, assistantMsgId)
                    : undefined,
                toolChoice: 'auto',
                stopWhen: stepCountIs(config.maxToolRoundtrips),
                temperature: config.temperature ?? 0.7,
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
                            metadata: { toolCallsCount: accumulated.toolCallsCount, agentMode: true, resumed: true }
                        });
                    } catch { /* no romper el flujo */ }
                }
            });

            let hitlDetected = false;
            for await (const part of this.processStream(result, context, assistantMsgId, accumulated)) {
                yield part;
                if (part.type === 'tool-confirm-required') {
                    hitlDetected = true;
                }
            }

            if (!hitlDetected) {
                await DBAgentUtils.updateAgentMessage(assistantMsgId, {
                    textContent: accumulated.text,
                    finishReason: 'stop'
                });

                const finalUsage = await result.usage;
                yield {
                    type: 'done',
                    usage: {
                        inputTokens: finalUsage?.inputTokens ?? 0,
                        outputTokens: finalUsage?.outputTokens ?? 0,
                        totalTokens: (finalUsage?.inputTokens ?? 0) + (finalUsage?.outputTokens ?? 0),
                        toolCallsCount: accumulated.toolCallsCount
                    },
                    finishReason: (await result.finishReason) ?? 'stop'
                };
            }

        } catch (error) {
            yield {
                type: 'error',
                code: 'ENGINE_ERROR',
                message: error instanceof Error ? error.message : 'Error en la continuación del agente'
            };
        }
    }
}
