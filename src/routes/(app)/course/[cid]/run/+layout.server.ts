import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { and, desc, eq, isNotNull, or } from 'drizzle-orm';
import { db, CourseRoleUtils } from '$lib/server/db';
import {
	chat,
	course,
	courseInteractiveLearning,
	interactiveLearning,
	interactiveLearningChat,
	interactiveLessonSession,
	learningActivityProgress,
	lessonSessionScope,
	userInteractiveLearningChat
} from '$lib/server/db/schema';
import type { InteractiveLearning, InteractiveLearningChat, LearningActivityProgress, Chat, InteractiveLessonSession } from '$lib/server/db/schema';

// Definir el tipo completo para una actividad de chat
interface FullActivityChat extends InteractiveLearning {
    courseInteractiveLearningId: string;
    progress: LearningActivityProgress | null;
    chatConfig: InteractiveLearningChat | null;
    chats: Chat[];
    latestLessonSession: InteractiveLessonSession | null;
}

export const load = (async ({ params, locals }) => {
    const userId = locals.user?.id;
    if (!userId) {
        throw error(401, 'Unauthorized');
    }

    // Get the course
    const courseData = await db
        .select({
            id: course.id,
            name: course.name,
            image: course.image,
            description: course.description
        })
        .from(course)
        .where(eq(course.id, params.cid))
        .execute();

    const foundCourse = courseData[0];
    if (!foundCourse) {
        throw error(404, 'Course not found');
    }

    // Verificar permisos usando el nuevo sistema de roles por curso
    const userCourseRole = await CourseRoleUtils.getUserHighestCourseRole(userId, params.cid);

    // Usuario necesita cualquier rol en el curso para acceder
    if (!userCourseRole) {
        throw error(403, 'Not enrolled in this course');
    }

    // Get all activities with their progress and chat configuration
    const activities = await db
        .select({
            // Interactive Learning fields
            id: interactiveLearning.id,
            name: interactiveLearning.name,
            slug: interactiveLearning.slug,
            description: interactiveLearning.description,
            image: interactiveLearning.image,
            type: interactiveLearning.type,
            content: interactiveLearning.content,
            status: interactiveLearning.status,
            publishedAt: interactiveLearning.publishedAt,
            closedAt: interactiveLearning.closedAt,
            archivedAt: interactiveLearning.archivedAt,
            createdAt: interactiveLearning.createdAt,
            updatedAt: interactiveLearning.updatedAt,
            metadata: interactiveLearning.metadata,
            // Course Interactive Learning fields
            courseInteractiveLearningId: courseInteractiveLearning.id,
            // Progress
            progress: learningActivityProgress,
            // Chat Configuration
            chatConfig: interactiveLearningChat
        })
        .from(interactiveLearning)
        .innerJoin(
            courseInteractiveLearning,
            eq(courseInteractiveLearning.interactiveLearningId, interactiveLearning.id)
        )
        .leftJoin(
            learningActivityProgress,
            and(
                eq(learningActivityProgress.activityId, interactiveLearning.id),
                eq(learningActivityProgress.userId, userId)
            )
        )
        .leftJoin(
            interactiveLearningChat,
            eq(interactiveLearningChat.id, interactiveLearning.id) // El id del chat ES el interactiveLearningId
        )
        .where(
            and(
                eq(courseInteractiveLearning.courseId, params.cid),
                or(
                    eq(interactiveLearning.status, 'published'),
                    eq(interactiveLearning.status, 'closed')
                )
            )
        )
        .orderBy(desc(interactiveLearning.createdAt));

    // Get chats for chat-type activities
    const chatActivities = activities.filter(a => a.type === 'chat');
    const lessonActivities = activities.filter(a => a.type === 'lesson');

    const chatsData = chatActivities.length > 0
        ? await db
            .select({
                chat: chat,
                interactiveLearningId: interactiveLearningChat.id // El id del chat ES el interactiveLearningId
            })
            .from(userInteractiveLearningChat)
            .innerJoin(
                chat,
                eq(userInteractiveLearningChat.chatId, chat.id)
            )
            .innerJoin(
                interactiveLearningChat,
                eq(userInteractiveLearningChat.interactiveLearningChatId, interactiveLearningChat.id)
            )
            .where(
                and(
                    eq(userInteractiveLearningChat.userId, userId)
                )
            )
            .execute()
        : [];

    const lessonSessions = lessonActivities.length > 0
        ? await db
            .select()
            .from(interactiveLessonSession)
            .where(
                and(
                    eq(interactiveLessonSession.userId, userId),
                    eq(interactiveLessonSession.courseId, params.cid),
                    eq(interactiveLessonSession.scope, lessonSessionScope.LEARNER),
                    isNotNull(interactiveLessonSession.definitionRevisionId)
                )
            )
            .orderBy(desc(interactiveLessonSession.attemptNumber), desc(interactiveLessonSession.createdAt))
            .execute()
        : [];

    // Organizar los chats por actividad
    const chatsByActivity = chatsData.reduce((acc, { chat, interactiveLearningId }) => {
        if (!acc[interactiveLearningId]) {
            acc[interactiveLearningId] = [];
        }
        acc[interactiveLearningId].push(chat);
        return acc;
    }, {} as Record<string, Chat[]>);

    const latestLessonSessionByActivity = lessonSessions.reduce((acc, session) => {
        if (!acc[session.interactiveLearningId]) {
            acc[session.interactiveLearningId] = session;
        }
        return acc;
    }, {} as Record<string, InteractiveLessonSession>);

    // Combinar toda la información
    const fullActivities: FullActivityChat[] = activities.map(activity => ({
        ...activity,
        chats: activity.type === 'chat' ? (chatsByActivity[activity.id] || []) : [],
        latestLessonSession: activity.type === 'lesson' ? (latestLessonSessionByActivity[activity.id] || null) : null
    }));

    return {
        course: foundCourse,
        activities: fullActivities,
        user: locals.user
    };
}) satisfies LayoutServerLoad;
