import { error } from '@sveltejs/kit';
import { db, CourseRoleUtils } from '$lib/server/db';
import { and, count, eq, inArray } from 'drizzle-orm';
import {
	agentMessage,
	interactiveLearning,
	learningActivityProgress,
	userInteractiveLearningChat
} from '$lib/server/db/schema';
import DBChatUtils from '$lib/server/db/DBChatUtils';
import { ACTIVITY_COMPLETION_MIN_MESSAGES } from '$lib/constants';
import { LessonReviewService } from '$lib/server/lesson/LessonReviewService';

type InteractiveLearningRecord = typeof interactiveLearning.$inferSelect;

type EnrolledStudent = {
	id: string;
	visitorId: string;
	username: string | null;
	email: string | null;
	image: string | null;
	alias: string | null;
};

type StudentDraftMetrics = {
	totalKeypresses: number;
	totalPastes: number;
	totalTimeSpentSeconds: number;
};

function emptyStudentDraftMetrics(): StudentDraftMetrics {
	return {
		totalKeypresses: 0,
		totalPastes: 0,
		totalTimeSpentSeconds: 0
	};
}

function parseDraftMetrics(metadata: string | null | undefined): StudentDraftMetrics {
	if (!metadata) return emptyStudentDraftMetrics();

	try {
		const parsed = JSON.parse(metadata) as Record<string, unknown>;

		return {
			totalKeypresses: typeof parsed.keystrokeCount === 'number' ? parsed.keystrokeCount : 0,
			totalPastes: typeof parsed.pasteCount === 'number' ? parsed.pasteCount : 0,
			totalTimeSpentSeconds:
				typeof parsed.timeSpentSeconds === 'number' ? parsed.timeSpentSeconds : 0
		};
	} catch {
		return emptyStudentDraftMetrics();
	}
}

async function getEnrolledStudents(courseId: string): Promise<EnrolledStudent[]> {
	const courseUsers = await CourseRoleUtils.getCourseUsers(courseId);

	return courseUsers
		.filter((user) => user.role === 'student')
		.map((user) => ({
			id: user.userId,
			visitorId: user.userId,
			username: user.username,
			email: user.email,
			image: user.image,
			alias: user.alias
		}));
}

export async function loadLessonStudentsPageData(
	courseId: string,
	interactive: InteractiveLearningRecord
) {
	const lessonDirectory = await LessonReviewService.getStudentDirectory({
		courseId,
		activity: interactive
	});

	return {
		view: 'lesson' as const,
		interactive,
		lessonStudents: lessonDirectory.students,
		lessonSummary: lessonDirectory.summary
	};
}

export async function loadAgentStudentsPageData(
	courseId: string,
	interactive: InteractiveLearningRecord
) {
	const enrolledStudents = await getEnrolledStudents(courseId);
	const sessions = await db
		.select()
		.from(userInteractiveLearningChat)
		.where(eq(userInteractiveLearningChat.interactiveLearningChatId, interactive.id));

	const studentIds = enrolledStudents.map((student) => student.id);
	const chatIds = sessions.map((session) => session.chatId);
	const messageCounts: Record<string, number> = {};
	const draftMetricsByChatId = new Map<string, StudentDraftMetrics>();
	const progressStatusByUser = new Map<string, string>();

	if (chatIds.length > 0) {
		const counts = await db
			.select({ chatId: agentMessage.chatId, messageCount: count(agentMessage.id) })
			.from(agentMessage)
			.where(inArray(agentMessage.chatId, chatIds))
			.groupBy(agentMessage.chatId);

		counts.forEach((entry) => {
			messageCounts[entry.chatId] = entry.messageCount;
		});

		const userMessageMetrics = await db
			.select({
				chatId: agentMessage.chatId,
				metadata: agentMessage.metadata
			})
			.from(agentMessage)
			.where(and(inArray(agentMessage.chatId, chatIds), eq(agentMessage.role, 'user')));

		for (const message of userMessageMetrics) {
			const currentTotals = draftMetricsByChatId.get(message.chatId) ?? emptyStudentDraftMetrics();
			const messageMetrics = parseDraftMetrics(message.metadata);

			currentTotals.totalKeypresses += messageMetrics.totalKeypresses;
			currentTotals.totalPastes += messageMetrics.totalPastes;
			currentTotals.totalTimeSpentSeconds += messageMetrics.totalTimeSpentSeconds;

			draftMetricsByChatId.set(message.chatId, currentTotals);
		}
	}

	if (studentIds.length > 0) {
		const progressRows = await db
			.select({
				userId: learningActivityProgress.userId,
				status: learningActivityProgress.status
			})
			.from(learningActivityProgress)
			.where(
				and(
					eq(learningActivityProgress.courseId, courseId),
					eq(learningActivityProgress.activityId, interactive.id),
					inArray(learningActivityProgress.userId, studentIds)
				)
			);

		for (const row of progressRows) {
			progressStatusByUser.set(row.userId, row.status);
		}
	}

	const students = enrolledStudents.map((student) => {
		const studentSessions = sessions.filter((session) => session.userId === student.id);
		const totalMessages = studentSessions.reduce(
			(sum, session) => sum + (messageCounts[session.chatId] || 0),
			0
		);
		const draftMetrics = studentSessions.reduce((totals, session) => {
			const sessionMetrics = draftMetricsByChatId.get(session.chatId);
			if (!sessionMetrics) return totals;

			totals.totalKeypresses += sessionMetrics.totalKeypresses;
			totals.totalPastes += sessionMetrics.totalPastes;
			totals.totalTimeSpentSeconds += sessionMetrics.totalTimeSpentSeconds;

			return totals;
		}, emptyStudentDraftMetrics());
		const hasActivity = studentSessions.length > 0;
		const progressStatus = progressStatusByUser.get(student.id);
		const isCompleted = progressStatus === 'completed';
		const lastActivity =
			studentSessions.length > 0
				? new Date(
						Math.max(
							...studentSessions.map((session) =>
								session.createdAt instanceof Date
									? session.createdAt.getTime()
									: new Date(session.createdAt).getTime()
							)
						)
					)
				: null;

		return {
			...student,
			chats: studentSessions.map((session) => ({ chat: session, messages: [] })),
			hasActivity,
			isCompleted,
			inProgress: hasActivity && !isCompleted,
			lastActivity,
			totalMessages,
			totalKeypresses: draftMetrics.totalKeypresses,
			totalPastes: draftMetrics.totalPastes,
			totalTimeSpentSeconds: draftMetrics.totalTimeSpentSeconds,
			hasCompletionMarker: isCompleted
		};
	});

	return {
		view: 'agent' as const,
		interactive,
		students,
		requiresMinMessages: ACTIVITY_COMPLETION_MIN_MESSAGES
	};
}

export async function loadChatStudentsPageData(
	courseId: string,
	interactive: InteractiveLearningRecord
) {
	const enrolledStudents = await getEnrolledStudents(courseId);
	const interactiveChat = await DBChatUtils.loadInteractiveChatFromInteractiveId(interactive.id, {
		bypassStatusCheck: true
	});

	if (!interactiveChat) {
		throw error(404, 'Chat interactivo no encontrado');
	}

	const chatResults = await DBChatUtils.getAllChatInstancesFromInteractiveId(
		interactiveChat.interactive_learning_chat.id,
		undefined,
		undefined,
		{ page: 1, pageSize: 1000 }
	);

	const students = enrolledStudents.map((student) => {
		const studentChats = chatResults.chats.filter((chat) => chat.chat.userId === student.id);
		const totalMessages = studentChats.reduce((sum, chat) => sum + (chat.messages?.length || 0), 0);
		const draftMetrics = studentChats.reduce((totals, chat) => {
			if (!chat.messages) return totals;

			for (const message of chat.messages) {
				const messageMetrics = parseDraftMetrics(message.metadata);
				totals.totalKeypresses += messageMetrics.totalKeypresses;
				totals.totalPastes += messageMetrics.totalPastes;
				totals.totalTimeSpentSeconds += messageMetrics.totalTimeSpentSeconds;
			}

			return totals;
		}, emptyStudentDraftMetrics());

		let hasCompletionMarker = false;
		studentChats.forEach((chat) => {
			if (!chat.messages) return;

			for (const message of chat.messages) {
				if (message.content.includes('[[DONE]]')) {
					hasCompletionMarker = true;
					break;
				}
			}
		});

		const hasActivity = studentChats.length > 0;
		const isCompleted = totalMessages >= ACTIVITY_COMPLETION_MIN_MESSAGES && hasCompletionMarker;
		const lastActivity =
			studentChats.length > 0
				? new Date(Math.max(...studentChats.map((chat) => new Date(chat.chat.createdAt).getTime())))
				: null;

		return {
			...student,
			chats: studentChats,
			hasActivity,
			isCompleted,
			inProgress: hasActivity && !isCompleted,
			lastActivity,
			totalMessages,
			totalKeypresses: draftMetrics.totalKeypresses,
			totalPastes: draftMetrics.totalPastes,
			totalTimeSpentSeconds: draftMetrics.totalTimeSpentSeconds,
			hasCompletionMarker
		};
	});

	return {
		view: 'chat' as const,
		interactive,
		interactiveChat,
		students,
		requiresMinMessages: ACTIVITY_COMPLETION_MIN_MESSAGES
	};
}
