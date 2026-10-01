import type { AgentContext, ToolResult } from '$lib/types/agent';
import { notificationService } from '$lib/server/notifications';

export interface SendNotificationParams {
    title: string;
    message: string;
    priority?: 'low' | 'normal' | 'high';
}

/**
 * Herramienta para enviar una notificación in-app al estudiante.
 * requiresConfirmation: true — requiere aprobación antes de enviar.
 */
export async function sendNotification(params: SendNotificationParams, context: AgentContext): Promise<ToolResult> {
    const start = Date.now();

    try {
        if (!params.title || !params.message) {
            return {
                success: false,
                errorMessage: 'Se requieren título y mensaje para la notificación.',
                durationMs: Date.now() - start
            };
        }

        const result = await notificationService.notify({
            userId: context.userId,
            type: 'custom',
            title: params.title,
            message: params.message,
            priority: params.priority ?? 'normal',
            courseId: context.courseId,
            activityId: context.activityId,
            channels: ['in_app']
        });

        if (!result.success) {
            return {
                success: false,
                errorMessage: 'No se pudo enviar la notificación.',
                durationMs: Date.now() - start
            };
        }

        return {
            success: true,
            data: { title: params.title, message: params.message, notificationId: result.notificationId },
            displayText: `Notificación enviada: "${params.title}"`,
            durationMs: Date.now() - start
        };
    } catch (err) {
        return {
            success: false,
            errorMessage: err instanceof Error ? err.message : 'Error al enviar notificación',
            durationMs: Date.now() - start
        };
    }
}
