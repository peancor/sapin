import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import type { AgentContext, ToolResult } from '$lib/types/agent';

interface ProgressParams {
    includeDetails?: boolean;
}

export async function getStudentProgress(
    params: ProgressParams,
    context: AgentContext
): Promise<ToolResult> {
    const start = Date.now();

    try {
        if (!context.courseId) {
            return {
                success: true,
                data: { completedActivities: 0, totalActivities: 0, completionRate: 0, activities: [] },
                displayText: 'No hay información de curso disponible.',
                durationMs: Date.now() - start
            };
        }

        // Obtener el resumen de progreso del curso
        const [summary] = await db
            .select()
            .from(schema.courseProgressSummary)
            .where(
                and(
                    eq(schema.courseProgressSummary.userId, context.userId),
                    eq(schema.courseProgressSummary.courseId, context.courseId)
                )
            );

        if (!summary) {
            return {
                success: true,
                data: { completedActivities: 0, totalActivities: 0, completionRate: 0, activities: [] },
                displayText: 'El estudiante aún no ha comenzado actividades en este curso.',
                durationMs: Date.now() - start
            };
        }

        let activities: Record<string, unknown>[] = [];

        if (params.includeDetails) {
            const progressRows = await db
                .select({
                    progress: schema.learningActivityProgress,
                    activity: schema.interactiveLearning
                })
                .from(schema.learningActivityProgress)
                .innerJoin(
                    schema.interactiveLearning,
                    eq(schema.learningActivityProgress.activityId, schema.interactiveLearning.id)
                )
                .where(
                    and(
                        eq(schema.learningActivityProgress.userId, context.userId),
                        eq(schema.learningActivityProgress.courseId, context.courseId)
                    )
                );

            activities = progressRows.map((row) => ({
                name: row.activity.name,
                status: row.progress.status,
                startedAt: row.progress.startedAt,
                completedAt: row.progress.completedAt,
                timeSpentSeconds: row.progress.timeSpentSeconds
            }));
        }

        const completedActivities = summary.completedActivities ?? 0;
        const inProgressActivities = summary.inProgressActivities ?? 0;
        const totalActivities = completedActivities + inProgressActivities;
        const completionRate = summary.completionRate ?? 0;

        return {
            success: true,
            data: {
                completedActivities,
                totalActivities,
                completionRate,
                activities: params.includeDetails ? activities : []
            },
            displayText: `El estudiante ha completado ${completedActivities} actividades (${completionRate}% de progreso).`,
            durationMs: Date.now() - start
        };
    } catch (error) {
        return {
            success: false,
            errorMessage: error instanceof Error ? error.message : 'Error al obtener el progreso',
            durationMs: Date.now() - start
        };
    }
}
