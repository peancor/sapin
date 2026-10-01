import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { markActivityCompleted } from '$lib/server/db/ProgressWriteUtils';
import { AIUtils } from '$lib/server/ai/AIUtils';
import type { AgentContext } from '$lib/types/agent';

export type FinalizationHandler = 'mark_complete_and_notify' | 'mark_complete_only' | 'notify_only';

export interface FinalizeActivityPayload {
    summary: string;
    result?: 'completed' | 'passed' | 'failed';
    score?: number;
    feedback?: string;
    toolCallId: string;
    toolName: string;
}

interface AgentFinalizationMetadata {
    executedAt: string;
    handler: FinalizationHandler;
    toolCallId: string;
    toolName: string;
    assistantMessageId: string;
    payload: Omit<FinalizeActivityPayload, 'toolCallId' | 'toolName'>;
    finalizationConfig: Record<string, unknown> | null;
}

interface ChatMetadata {
    agentFinalization?: AgentFinalizationMetadata;
    [key: string]: unknown;
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // Ignore malformed JSON metadata.
    }
    return null;
}

function resolveFinalizationHandler(raw: string | null | undefined): FinalizationHandler {
    if (raw === 'mark_complete_only' || raw === 'notify_only' || raw === 'mark_complete_and_notify') {
        return raw;
    }
    return 'mark_complete_and_notify';
}

export class AgentFinalizationService {
    static async runFinalizationHook(input: {
        context: AgentContext;
        payload: FinalizeActivityPayload;
        assistantMessageId: string;
    }): Promise<{ executed: boolean; reason?: string }> {
        const { context, payload, assistantMessageId } = input;
        const cfg = context.activityConfig;

        if (!cfg.finalizationEnabled) {
            return { executed: false, reason: 'finalization-disabled' };
        }

        const chat = await db
            .select({
                id: schema.chat.id,
                metadata: schema.chat.metadata
            })
            .from(schema.chat)
            .where(eq(schema.chat.id, context.chatId))
            .get();

        if (!chat) {
            return { executed: false, reason: 'chat-not-found' };
        }

        const parsedMetadata = parseJsonObject(chat.metadata) ?? {};
        const chatMetadata = parsedMetadata as ChatMetadata;
        if (chatMetadata.agentFinalization?.executedAt) {
            return { executed: false, reason: 'already-finalized' };
        }

        const handler = resolveFinalizationHandler(cfg.finalizationHandler);
        const shouldMarkCompleted =
            handler === 'mark_complete_and_notify' || handler === 'mark_complete_only';
        const shouldNotify = handler === 'mark_complete_and_notify' || handler === 'notify_only';

        if (shouldMarkCompleted && context.courseId) {
            await markActivityCompleted({
                userId: context.userId,
                courseId: context.courseId,
                activityId: context.activityId,
                source: 'agent-chat:finalize-tool'
            });
        }

        if (shouldNotify) {
            await AIUtils.notifyEndOfAgentChat(context.chatId, context.activityId, context.userId);
        }

        const nextMetadata: ChatMetadata = {
            ...chatMetadata,
            agentFinalization: {
                executedAt: new Date().toISOString(),
                handler,
                toolCallId: payload.toolCallId,
                toolName: payload.toolName,
                assistantMessageId,
                payload: {
                    summary: payload.summary,
                    result: payload.result,
                    score: payload.score,
                    feedback: payload.feedback
                },
                finalizationConfig: parseJsonObject(cfg.finalizationConfig)
            }
        };

        await db
            .update(schema.chat)
            .set({
                metadata: JSON.stringify(nextMetadata),
                updatedAt: new Date()
            })
            .where(eq(schema.chat.id, context.chatId));

        return { executed: true };
    }
}
