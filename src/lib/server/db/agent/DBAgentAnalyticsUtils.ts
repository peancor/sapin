import { db } from '..';
import { eq, desc, count, avg, sql, inArray } from 'drizzle-orm';
import * as schema from '../schema';

export default class DBAgentAnalyticsUtils {
    // ─── Analítica Global ───

    static async getGlobalAgentAnalytics() {
        const [msgStats] = await db
            .select({
                totalSessions: sql<number>`count(distinct ${schema.agentMessage.chatId})`,
                totalMessages: sql<number>`sum(case when ${schema.agentMessage.role} = 'user' then 1 else 0 end)`
            })
            .from(schema.agentMessage);

        const toolStats = await db
            .select({
                toolName: schema.agentToolCall.toolName,
                displayName: schema.agentToolDefinition.displayName,
                total: count(schema.agentToolCall.id),
                completed: sql<number>`sum(case when ${schema.agentToolCall.status} = 'completed' then 1 else 0 end)`,
                failed: sql<number>`sum(case when ${schema.agentToolCall.status} = 'failed' then 1 else 0 end)`,
                rejected: sql<number>`sum(case when ${schema.agentToolCall.status} = 'rejected' then 1 else 0 end)`,
                avgDurationMs: avg(schema.agentToolCall.durationMs)
            })
            .from(schema.agentToolCall)
            .leftJoin(
                schema.agentToolDefinition,
                eq(schema.agentToolCall.toolDefinitionId, schema.agentToolDefinition.id)
            )
            .groupBy(schema.agentToolCall.toolName)
            .orderBy(desc(count(schema.agentToolCall.id)));

        const uiStats = await db
            .select({
                componentKey: schema.agentUIComponent.componentKey,
                displayName: schema.agentUIComponent.displayName,
                total: count(schema.agentUIInstance.id),
                responded: sql<number>`sum(case when ${schema.agentUIInstance.userResponse} is not null then 1 else 0 end)`,
                avgScore: avg(schema.agentUIInstance.score)
            })
            .from(schema.agentUIInstance)
            .innerJoin(
                schema.agentUIComponent,
                eq(schema.agentUIInstance.uiComponentId, schema.agentUIComponent.id)
            )
            .groupBy(schema.agentUIComponent.componentKey);

        const [hitlStats] = await db
            .select({
                total: count(schema.agentToolCall.id),
                confirmed: sql<number>`sum(case when ${schema.agentToolCall.confirmedAt} is not null then 1 else 0 end)`,
                rejected: sql<number>`sum(case when ${schema.agentToolCall.status} = 'rejected' then 1 else 0 end)`
            })
            .from(schema.agentToolCall)
            .innerJoin(
                schema.agentToolDefinition,
                eq(schema.agentToolCall.toolDefinitionId, schema.agentToolDefinition.id)
            )
            .where(eq(schema.agentToolDefinition.requiresConfirmation, true));

        const hitlTotal = hitlStats?.total ?? 0;
        const hitlConfirmed = hitlStats?.confirmed ?? 0;

        return {
            sessions: msgStats?.totalSessions ?? 0,
            messages: msgStats?.totalMessages ?? 0,
            toolStats,
            uiStats,
            hitl: {
                total: hitlTotal,
                confirmed: hitlConfirmed,
                rejected: hitlStats?.rejected ?? 0,
                acceptanceRate: hitlTotal > 0 ? Math.round((hitlConfirmed / hitlTotal) * 100) : 0
            }
        };
    }

    static async getActivityAgentStats(activityId: string) {
        const chats = await db
            .select({
                chatId: schema.userInteractiveLearningChat.chatId,
                userId: schema.userInteractiveLearningChat.userId
            })
            .from(schema.userInteractiveLearningChat)
            .where(eq(schema.userInteractiveLearningChat.interactiveLearningChatId, activityId));

        if (chats.length === 0) {
            return { sessions: 0, messages: 0, toolStats: [], uiStats: [] };
        }

        const chatIds = chats.map((c) => c.chatId);

        const [msgStats] = await db
            .select({
                totalMessages: sql<number>`sum(case when ${schema.agentMessage.role} = 'user' then 1 else 0 end)`
            })
            .from(schema.agentMessage)
            .where(inArray(schema.agentMessage.chatId, chatIds));

        const toolStats = await db
            .select({
                toolName: schema.agentToolCall.toolName,
                total: count(schema.agentToolCall.id),
                completed: sql<number>`sum(case when ${schema.agentToolCall.status} = 'completed' then 1 else 0 end)`,
                failed: sql<number>`sum(case when ${schema.agentToolCall.status} = 'failed' then 1 else 0 end)`,
                rejected: sql<number>`sum(case when ${schema.agentToolCall.status} = 'rejected' then 1 else 0 end)`
            })
            .from(schema.agentToolCall)
            .innerJoin(
                schema.agentMessage,
                eq(schema.agentToolCall.messageId, schema.agentMessage.id)
            )
            .where(inArray(schema.agentMessage.chatId, chatIds))
            .groupBy(schema.agentToolCall.toolName)
            .orderBy(desc(count(schema.agentToolCall.id)));

        const uiStats = await db
            .select({
                componentKey: schema.agentUIComponent.componentKey,
                displayName: schema.agentUIComponent.displayName,
                total: count(schema.agentUIInstance.id),
                responded: sql<number>`sum(case when ${schema.agentUIInstance.userResponse} is not null then 1 else 0 end)`,
                avgScore: avg(schema.agentUIInstance.score)
            })
            .from(schema.agentUIInstance)
            .innerJoin(
                schema.agentMessage,
                eq(schema.agentUIInstance.messageId, schema.agentMessage.id)
            )
            .innerJoin(
                schema.agentUIComponent,
                eq(schema.agentUIInstance.uiComponentId, schema.agentUIComponent.id)
            )
            .where(inArray(schema.agentMessage.chatId, chatIds))
            .groupBy(schema.agentUIComponent.componentKey);

        return {
            sessions: chats.length,
            messages: msgStats?.totalMessages ?? 0,
            toolStats,
            uiStats
        };
    }

    // ─── Export de resultados UI ───

    static async getUIResponsesForActivity(activityId: string) {
        const chats = await db
            .select({
                chatId: schema.userInteractiveLearningChat.chatId,
                userId: schema.userInteractiveLearningChat.userId
            })
            .from(schema.userInteractiveLearningChat)
            .where(eq(schema.userInteractiveLearningChat.interactiveLearningChatId, activityId));

        if (chats.length === 0) return [];

        const chatIds = chats.map((c) => c.chatId);
        const userIdMap = Object.fromEntries(chats.map((c) => [c.chatId, c.userId]));

        const rows = await db
            .select({
                instance: schema.agentUIInstance,
                componentKey: schema.agentUIComponent.componentKey,
                chatId: schema.agentMessage.chatId
            })
            .from(schema.agentUIInstance)
            .innerJoin(
                schema.agentMessage,
                eq(schema.agentUIInstance.messageId, schema.agentMessage.id)
            )
            .innerJoin(
                schema.agentUIComponent,
                eq(schema.agentUIInstance.uiComponentId, schema.agentUIComponent.id)
            )
            .where(inArray(schema.agentMessage.chatId, chatIds))
            .orderBy(desc(schema.agentUIInstance.createdAt));

        return rows.map((r) => ({
            instanceId: r.instance.id,
            userId: userIdMap[r.chatId] ?? '',
            chatId: r.chatId,
            componentKey: r.componentKey,
            props: r.instance.props ? (JSON.parse(r.instance.props) as unknown) : null,
            userResponse: r.instance.userResponse
                ? (JSON.parse(r.instance.userResponse) as unknown)
                : null,
            score: r.instance.score,
            respondedAt: r.instance.respondedAt,
            createdAt: r.instance.createdAt
        }));
    }
}
