import { error, redirect } from '@sveltejs/kit';
import { db, CourseRoleUtils, CourseInteractiveAuthUtils } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { interactiveLearning, interactiveLearningChat } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';
import DBChatUtils from '$lib/server/db/DBChatUtils';
import { ACTIVITY_COMPLETION_MIN_MESSAGES } from '$lib/constants';

export const load = (async ({ params, locals }) => {
	// Verificación de seguridad (defensa en profundidad)
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const { cid, ilid } = params;
	const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
		locals.user.id, cid, ilid, locals.user.highestRoleLevel
	);

	if (!access.allowed) {
		throw error(403, access.reason || 'No tienes permisos para administrar esta actividad');
	}

	// Verificar que el interactive learning existe
	const interactive = await db
		.select()
		.from(interactiveLearning)
		.where(eq(interactiveLearning.id, ilid))
		.get();

	if (!interactive) {
		throw error(404, 'Actividad no encontrada');
	}

	// Obtener la configuración del chat interactivo
	// El id de interactiveLearningChat ES el interactiveLearningId (patrón 1:1)
	const chatConfig = await db
		.select()
		.from(interactiveLearningChat)
		.where(eq(interactiveLearningChat.id, ilid))
		.get();

	// Obtener el interactive chat completo para estadísticas
	// bypassStatusCheck: true porque es una ruta admin
	const interactiveChat = await DBChatUtils.loadInteractiveChatFromInteractiveId(ilid, { bypassStatusCheck: true });

	// Obtener todos los estudiantes inscritos en el curso usando CourseRoleUtils
	const courseUsers = await CourseRoleUtils.getCourseUsers(cid);
	const enrolledStudents = courseUsers
		.filter((u) => u.role === 'student')
		.map((u) => ({
			id: u.userId,
			visitorId: u.userId,
			username: u.username,
			email: u.email,
			image: u.image,
			alias: u.alias
		}));

	// Estadísticas iniciales
	let totalChats = 0;
	let totalMessages = 0;
	let studentsWithActivity = 0;
	let studentsCompleted = 0;
	let lastActivityDate: Date | null = null;

	// Si hay chat interactivo, obtener estadísticas
	if (interactiveChat) {
		const chatResults = await DBChatUtils.getAllChatInstancesFromInteractiveId(
			interactiveChat.interactive_learning_chat.id,
			undefined,
			undefined,
			{ page: 1, pageSize: 1000 }
		);

		totalChats = chatResults.chats.length;

		// Calcular estadísticas por estudiante
		const studentIds = new Set<string>();
		const completedStudentIds = new Set<string>();

		chatResults.chats.forEach((chat) => {
			if (chat.chat.userId) {
				studentIds.add(chat.chat.userId);
			}

			const messageCount = chat.messages?.length || 0;
			totalMessages += messageCount;

			// Verificar si tiene marca de completado
			let hasCompletionMarker = false;
			if (chat.messages) {
				for (const message of chat.messages) {
					if (message.content.includes('[[DONE]]')) {
						hasCompletionMarker = true;
						break;
					}
				}
			}

			if (messageCount >= ACTIVITY_COMPLETION_MIN_MESSAGES && hasCompletionMarker && chat.chat.userId) {
				completedStudentIds.add(chat.chat.userId);
			}

			// Actualizar la fecha de última actividad
			const chatDate = new Date(chat.chat.createdAt);
			if (!lastActivityDate || chatDate > lastActivityDate) {
				lastActivityDate = chatDate;
			}
		});

		studentsWithActivity = studentIds.size;
		studentsCompleted = completedStudentIds.size;
	}

	// Calcular porcentajes
	const totalStudents = enrolledStudents.length;
	const participationRate = totalStudents > 0 ? Math.round((studentsWithActivity / totalStudents) * 100) : 0;
	const completionRate = totalStudents > 0 ? Math.round((studentsCompleted / totalStudents) * 100) : 0;
	const averageMessagesPerChat = totalChats > 0 ? Math.round(totalMessages / totalChats) : 0;

	return {
		interactive,
		chatConfig,
		stats: {
			totalStudents,
			studentsWithActivity,
			studentsCompleted,
			totalChats,
			totalMessages,
			participationRate,
			completionRate,
			averageMessagesPerChat,
			lastActivityDate,
			requiresMinMessages: ACTIVITY_COMPLETION_MIN_MESSAGES
		}
	};
}) satisfies PageServerLoad;
