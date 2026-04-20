import { error, redirect } from '@sveltejs/kit';
import { db, CourseRoleUtils, CourseInteractiveAuthUtils } from '$lib/server/db';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import {
	interactiveLearning,
	interactiveLearningChat,
	interactiveLearningLesson,
	interactiveLessonBlockState,
	interactiveLessonSession,
	lessonSessionScope,
	message
} from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';
import DBChatUtils from '$lib/server/db/DBChatUtils';
import { DBAgentActivityUtils, DBAgentAnalyticsUtils } from '$lib/server/db/agent';
import { ACTIVITY_COMPLETION_MIN_MESSAGES } from '$lib/constants';
import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '$lib/server/agent/tools/constants';
import { LearningEvidenceService } from '$lib/server/learning-evidence';
import { LessonRevisionService } from '$lib/server/lesson/LessonRevisionService';

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

	// Obtener todos los estudiantes inscritos en el curso
	const courseUsers = await CourseRoleUtils.getCourseUsers(cid);
	const totalStudents = courseUsers.filter((u) => u.role === 'student').length;

	// === Actividad de tipo AGENT ===
	if (interactive.type === 'agent') {
		const agentConfig = await DBAgentActivityUtils.getAgentActivity(ilid);
		const agentStats = await DBAgentAnalyticsUtils.getActivityAgentStats(ilid);
		const enabledTools = await DBAgentActivityUtils.getEnabledToolsForActivity(
			ilid,
			BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
		);
		const overview = await LearningEvidenceService.getActivityEvidenceOverview(
			{
				actorUserId: locals.user.id,
				actorHighestRoleLevel: locals.user.highestRoleLevel
			},
			ilid
		);
		const studentsCompleted = overview.studentSummaries.filter(
			(summary) => summary.progressStatus === 'completed'
		).length;
		const studentsWithActivity = overview.studentsWithEvidenceCount;
		const totalChats = overview.totalSessions;
		const totalMessages = overview.totalMessages;
		const completionRate =
			totalStudents > 0 ? Math.round((studentsCompleted / totalStudents) * 100) : 0;
		const participationRate =
			totalStudents > 0 ? Math.round((studentsWithActivity / totalStudents) * 100) : 0;
		const averageMessagesPerChat =
			totalChats > 0 ? Math.round(totalMessages / totalChats) : 0;

		return {
			interactive,
			chatConfig: null,
			agentConfig,
			agentStats,
			lessonConfig: null,
			revisionSummary: null,
			enabledTools,
			stats: {
				totalStudents,
				studentsWithActivity,
				studentsCompleted,
				totalChats,
				totalMessages,
				participationRate,
				completionRate,
				averageMessagesPerChat,
				lastActivityDate: overview.lastActivityAt,
				requiresMinMessages: ACTIVITY_COMPLETION_MIN_MESSAGES
			}
		};
	}

	// === Actividad de tipo CHAT (lógica existente) ===
	if (interactive.type === 'lesson') {
		const [lessonConfig, revisionSummary] = await Promise.all([
			db
				.select()
				.from(interactiveLearningLesson)
				.where(eq(interactiveLearningLesson.id, ilid))
				.get(),
			LessonRevisionService.getRevisionAdminSummary(ilid)
		]);

		if (!lessonConfig) {
			throw error(500, 'La lesson no tiene configuración runtime');
		}

		const sessions = await db
			.select()
			.from(interactiveLessonSession)
			.where(
				and(
					eq(interactiveLessonSession.interactiveLearningId, ilid),
					eq(interactiveLessonSession.scope, lessonSessionScope.LEARNER),
					isNotNull(interactiveLessonSession.definitionRevisionId)
				)
			)
			.all();

		const sessionUserIds = [...new Set(sessions.map((session) => session.userId))];
		const completedUserIds = [
			...new Set(
				sessions
					.filter((session) => session.status === 'completed')
					.map((session) => session.userId)
			)
		];
		const blockStates = sessions.length
			? await db
					.select()
					.from(interactiveLessonBlockState)
					.where(inArray(interactiveLessonBlockState.sessionId, sessions.map((session) => session.id)))
					.all()
			: [];
		const chatIds = blockStates.map((state) => state.chatId).filter(Boolean) as string[];
		const totalMessages = chatIds.length
			? (
					await db
						.select()
						.from(message)
						.where(inArray(message.chatId, chatIds))
						.all()
			  ).length
			: 0;
		const lastActivityDate = sessions
			.map((session) => session.lastActiveAt)
			.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
		const participationRate =
			totalStudents > 0 ? Math.round((sessionUserIds.length / totalStudents) * 100) : 0;
		const completionRate =
			totalStudents > 0 ? Math.round((completedUserIds.length / totalStudents) * 100) : 0;

		return {
			interactive,
			chatConfig: null,
			agentConfig: null,
			agentStats: null,
			lessonConfig,
			revisionSummary,
			enabledTools: [],
			stats: {
				totalStudents,
				studentsWithActivity: sessionUserIds.length,
				studentsCompleted: completedUserIds.length,
				totalChats: sessions.length,
				totalMessages,
				participationRate,
				completionRate,
				averageMessagesPerChat: sessions.length > 0 ? Math.round(totalMessages / sessions.length) : 0,
				lastActivityDate,
				requiresMinMessages: 0
			}
		};
	}

	// === Actividad de tipo CHAT (lógica existente) ===
	const chatConfig = await db
		.select()
		.from(interactiveLearningChat)
		.where(eq(interactiveLearningChat.id, ilid))
		.get();

	const interactiveChat = await DBChatUtils.loadInteractiveChatFromInteractiveId(ilid, { bypassStatusCheck: true });

	let totalChats = 0;
	let totalMessages = 0;
	let studentsWithActivity = 0;
	let studentsCompleted = 0;
	let lastActivityDate: Date | null = null;

	if (interactiveChat) {
		const chatResults = await DBChatUtils.getAllChatInstancesFromInteractiveId(
			interactiveChat.interactive_learning_chat.id,
			undefined,
			undefined,
			{ page: 1, pageSize: 1000 }
		);

		totalChats = chatResults.chats.length;

		const studentIds = new Set<string>();
		const completedStudentIds = new Set<string>();

		chatResults.chats.forEach((chat) => {
			if (chat.chat.userId) studentIds.add(chat.chat.userId);

			const messageCount = chat.messages?.length || 0;
			totalMessages += messageCount;

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

			const chatDate = new Date(chat.chat.createdAt);
			if (!lastActivityDate || chatDate > lastActivityDate) lastActivityDate = chatDate;
		});

		studentsWithActivity = studentIds.size;
		studentsCompleted = completedStudentIds.size;
	}

	const participationRate = totalStudents > 0 ? Math.round((studentsWithActivity / totalStudents) * 100) : 0;
	const completionRate = totalStudents > 0 ? Math.round((studentsCompleted / totalStudents) * 100) : 0;
	const averageMessagesPerChat = totalChats > 0 ? Math.round(totalMessages / totalChats) : 0;

	return {
		interactive,
		chatConfig,
		agentConfig: null,
		agentStats: null,
		lessonConfig: null,
		revisionSummary: null,
		enabledTools: [],
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
