import type { RequestHandler } from '@sveltejs/kit';
import DBChatUtils from '$lib/server/db/DBChatUtils';
import { InsightsUtils } from '$lib/server/ai/InsightsUtils';
import { AIUtils } from '$lib/server/ai/AIUtils';
import type { ProcessedChatData, ReportOptions } from '$lib/types/insights';
import { db, CourseRoleUtils } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

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

		// 1. Obtener datos de la actividad interactiva
		// bypassStatusCheck: true porque esta API es para admins/staff
		const interactiveChat = await DBChatUtils.loadInteractiveChatFromInteractiveId(ilid, { bypassStatusCheck: true });

		// Obtener el ID del curso a través de courseInteractiveLearning (el id del chat ES el interactiveLearningId)
		const courseInteractive = await db
			.select()
			.from(table.courseInteractiveLearning)
			.where(
				eq(
					table.courseInteractiveLearning.interactiveLearningId,
					interactiveChat.interactive_learning_chat.id
				)
			)
			.limit(1);

		if (!courseInteractive[0]) {
			throw new Error('No se encontró el curso asociado a esta actividad');
		}

		const courseId = courseInteractive[0].courseId;

		// Verificar que el usuario tiene permisos sobre este curso
		const hasPermission = await CourseRoleUtils.userHasCoursePermission(
			user.id,
			courseId,
			'viewAnalytics'
		);
		if (!hasPermission && user.highestRoleLevel < 90) {
			return new Response('No tienes permisos para ver insights de esta actividad', { status: 403 });
		}

		const courseUsers = await CourseRoleUtils.getCourseUsers(courseId);
		const enrolledStudents = courseUsers.filter(u => u.role === 'student');
		const enrolledStudentIds = new Set(enrolledStudents.map((student) => student.userId));

		// 2. Obtener todas las conversaciones de estudiantes para esta actividad
		const chatResults = await DBChatUtils.getAllChatInstancesFromInteractiveId(
			interactiveChat.interactive_learning_chat.id,
			{}, // Sin filtros
			undefined, // Ordenación predeterminada
			undefined // Sin paginación - obtener todos
		);

		// Filtrar solo chats de estudiantes enrolados
		let filteredChats = chatResults.chats.filter((chat) => enrolledStudentIds.has(chat.user.id));

		// Si hay studentIds especificados y el modo no es cohort, filtrar por ellos
		if (options.studentIds && options.studentIds.length > 0 && options.analysisMode !== 'cohort') {
			const selectedStudentIds = new Set(options.studentIds);
			filteredChats = filteredChats.filter((chat) => selectedStudentIds.has(chat.user.id));
		}

		// 3. Preparar el contexto para el analisis AI
		const activityContext = {
			name: interactiveChat.interactive_learning.name,
			description: interactiveChat.interactive_learning.description,
			systemPrompt: interactiveChat.interactive_learning_chat.systemPrompt,
			llmRole: interactiveChat.interactive_learning_chat.llmRole,
			llmInstructions: interactiveChat.interactive_learning_chat.llmInstructions,
			llmContext: interactiveChat.interactive_learning_chat.llmContext
		};

		// 4. Preparar datos de chat de estudiantes
		const chats: ProcessedChatData[] = filteredChats.map((chat) => ({
			studentUsername: chat.user.username || chat.user.email || 'Anónimo',
			studentId: chat.user.id,
			createdAt: new Date(chat.chat.createdAt).toISOString(),
			messages: chat.messages.map((msg) => ({
				type: msg.type,
				content: msg.content,
				createdAt: new Date(msg.createdAt).toISOString()
			}))
		}));

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
			interactiveChat.interactive_learning_chat.id
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
				interactiveLearningId: interactiveChat.interactive_learning_chat.id
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
