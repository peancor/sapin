import type { RequestHandler } from '@sveltejs/kit';
import { InsightsUtils } from '$lib/server/ai/InsightsUtils';
import { AIUtils } from '$lib/server/ai/AIUtils';
import type { ReportOptions } from '$lib/types/insights';
import { LearningEvidenceService } from '$lib/server/learning-evidence';
import {
	toInsightsActivityContext,
	toInsightsProcessedChats
} from '$lib/server/learning-evidence/insights';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	try {
		const user = locals.user;
		if (!user) {
			return new Response('Usuario no autenticado', { status: 401 });
		}

		const ilid = params.ilid;
		if (!ilid) {
			return new Response('ID de actividad interactiva faltante', { status: 400 });
		}

		// Obtener opciones del cuerpo de la solicitud
		const options: ReportOptions = await request.json();
		const access = { actorUserId: user.id, actorHighestRoleLevel: user.highestRoleLevel };
		const selectedStudentIds =
			options.studentIds && options.studentIds.length > 0 && options.analysisMode !== 'cohort'
				? options.studentIds
				: undefined;

		const overview = await LearningEvidenceService.getActivityEvidenceOverview(
			access,
			ilid,
			selectedStudentIds
		);
		const activityContext = toInsightsActivityContext(overview);
		const courseId = overview.activity.courseId;

		if (!courseId) {
			throw new Error('No se encontró el curso asociado a esta actividad');
		}

		const sessions = await LearningEvidenceService.getActivityTranscripts(access, {
			activityId: ilid,
			studentIds: selectedStudentIds
		});
		const chats = toInsightsProcessedChats(sessions);

		// 5. Crear prompt para el análisis
		const prompt = InsightsUtils.generateChatAnalysisPrompt(activityContext, chats, options);

		// 6. Validar que el modelo esté disponible en el sistema
		const availableModels = await AIUtils.getAvailableModels();
		const isModelAvailable = availableModels.some(m => m.name === options.model);
		const defaultModel = await AIUtils.getDefaultModel();
		const selectedModel = isModelAvailable ? options.model : defaultModel;

		// 7. Verificar cuotas antes de proceder
		const quotaCheck = await AIUtils.checkQuota(
			selectedModel,
			user.id,
			courseId,
			ilid
		);

		if (!quotaCheck.allowed) {
			return new Response(`Cuota excedida: ${quotaCheck.reason}`, { status: 429 });
		}

		// 8. Usar el cliente de IA con el nuevo sistema de gestión de modelos
		let readableStream: ReadableStream;

		try {
			const streamText = await AIUtils.streamTextFromPrompt(prompt, selectedModel, {
				userId: user.id,
				courseId,
				interactiveLearningId: ilid
			});

			readableStream = new ReadableStream({
				async start(controller) {
					for await (const textPart of streamText.textStream) {
						controller.enqueue(new TextEncoder().encode(textPart));
					}
					controller.close();
				}
			});
		} catch (error) {
			console.error('Error procesando el stream:', error);
			throw error;
		}

		// Devolver el ReadableStream como respuesta
		return new Response(readableStream, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8'
			}
		});

	} catch (error) {
		console.error('Error generando insights:', error);
		return new Response(
			'Error generando insights: ' + (error instanceof Error ? error.message : 'Error desconocido'),
			{
				status: 500,
				headers: {
					'Content-Type': 'text/plain; charset=utf-8'
				}
			}
		);
	}
};
