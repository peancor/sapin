import { db } from '..';
import { eq, asc } from 'drizzle-orm';
import * as schema from '../schema';
import { nanoid } from 'nanoid';
import type { AgentHistoryMessage } from '$lib/types/agent';
import type { ModelMessage } from 'ai';

export default class DBAgentMessageUtils {
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
}
