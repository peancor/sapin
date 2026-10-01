import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import type { AgentContext, ToolResult } from '$lib/types/agent';
import { nanoid } from 'nanoid';

export interface SaveGradeParams {
    activityId?: string;  // si se omite, usa la actividad actual
    score: number;        // 0.0 a 1.0
    feedback?: string;
}

/**
 * Herramienta para guardar una calificación del estudiante.
 * requiresConfirmation: true — requiere aprobación explícita antes de ejecutar.
 */
export async function saveGrade(params: SaveGradeParams, context: AgentContext): Promise<ToolResult> {
    const start = Date.now();

    try {
        const score = Math.max(0, Math.min(1, params.score));
        const scoreRaw = Math.round(score * 100);
        const targetActivityId = params.activityId ?? context.activityId;

        if (!context.courseId) {
            return {
                success: false,
                errorMessage: 'No se puede guardar la calificación: actividad no asociada a un curso.',
                durationMs: Date.now() - start
            };
        }

        // Verificar que la actividad existe y pertenece al curso
        const [activity] = await db
            .select({ id: schema.interactiveLearning.id, name: schema.interactiveLearning.name })
            .from(schema.interactiveLearning)
            .innerJoin(
                schema.courseInteractiveLearning,
                eq(schema.courseInteractiveLearning.interactiveLearningId, schema.interactiveLearning.id)
            )
            .where(
                and(
                    eq(schema.interactiveLearning.id, targetActivityId),
                    eq(schema.courseInteractiveLearning.courseId, context.courseId)
                )
            )
            .limit(1);

        if (!activity) {
            return {
                success: false,
                errorMessage: `Actividad "${targetActivityId}" no encontrada en el curso.`,
                durationMs: Date.now() - start
            };
        }

        const now = new Date();

        // Actualizar o crear el progreso
        const [existing] = await db
            .select()
            .from(schema.learningActivityProgress)
            .where(
                and(
                    eq(schema.learningActivityProgress.userId, context.userId),
                    eq(schema.learningActivityProgress.activityId, targetActivityId)
                )
            )
            .limit(1);

        if (existing) {
            await db
                .update(schema.learningActivityProgress)
                .set({
                    scoreRaw,
                    scoreNormalized: scoreRaw,
                    lastInteractionAt: now,
                    updatedAt: now
                })
                .where(eq(schema.learningActivityProgress.id, existing.id));
        } else {
            await db.insert(schema.learningActivityProgress).values({
                id: nanoid(),
                userId: context.userId,
                activityId: targetActivityId,
                courseId: context.courseId,
                activityType: 'agent',
                status: 'completed',
                scoreRaw,
                scoreNormalized: scoreRaw,
                attemptsCount: 1,
                timeSpentSeconds: 0,
                version: 1,
                lastInteractionAt: now,
                createdAt: now,
                updatedAt: now
            });
        }

        return {
            success: true,
            data: {
                activityId: targetActivityId,
                activityName: activity.name,
                score,
                scorePercent: scoreRaw,
                feedback: params.feedback
            },
            displayText: `Calificación guardada: ${scoreRaw}% en "${activity.name}"${params.feedback ? `. Retroalimentación: ${params.feedback}` : ''}`,
            durationMs: Date.now() - start
        };
    } catch (err) {
        return {
            success: false,
            errorMessage: err instanceof Error ? err.message : 'Error al guardar calificación',
            durationMs: Date.now() - start
        };
    }
}
