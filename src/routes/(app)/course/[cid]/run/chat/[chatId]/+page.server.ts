import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, CourseRoleUtils, CourseInteractiveAuthUtils } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { course, interactiveLearning, interactiveLearningChat, message, userInteractiveLearningChat, chat } from '$lib/server/db/schema';

export const load = (async ({ params, locals }) => {
    const userId = locals.user?.id;
    if (!userId) {
        throw error(401, 'Unauthorized');
    }

    // Get the course
    const courseData = await db
        .select({
            id: course.id,
            name: course.name
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

    if (!userCourseRole) {
        throw error(403, 'Not enrolled in this course');
    }

    // Verificar propiedad del chat o si es staff
    const chatData = await db
        .select()
        .from(chat)
        .where(eq(chat.id, params.chatId))
        .get();

    if (!chatData) {
        throw error(404, 'Chat not found');
    }

    // Verificar acceso al chat específico
    const isStaff = CourseInteractiveAuthUtils.STAFF_ROLES.includes(
        userCourseRole.role as typeof CourseInteractiveAuthUtils.STAFF_ROLES[number]
    );
    const isOwner = chatData.userId === userId;

    if (!isStaff && !isOwner) {
        throw error(403, 'No tienes acceso a este chat');
    }

    // Fetch messages for this chat instance
    const messages = await db
        .select()
        .from(message)
        .where(eq(message.chatId, params.chatId))
        .orderBy(message.createdAt);

    // Get the interactive learning chat and interactive learning data
    const learningData = await db
        .select({
            interactiveLearningChat: interactiveLearningChat,
            interactiveLearning: interactiveLearning
        })
        .from(userInteractiveLearningChat)
        .leftJoin(
            interactiveLearningChat,
            eq(userInteractiveLearningChat.interactiveLearningChatId, interactiveLearningChat.id)
        )
        .leftJoin(
            interactiveLearning,
            eq(interactiveLearningChat.id, interactiveLearning.id) // El id del chat ES el interactiveLearningId
        )
        .where(eq(userInteractiveLearningChat.chatId, params.chatId))
        .execute();

    if (!learningData[0]) {
        throw error(404, 'Interactive learning data not found');
    }

    return {
        chatId: params.chatId,
        course: foundCourse,
        messages,
        interactiveLearningChat: learningData[0].interactiveLearningChat,
        interactiveLearning: learningData[0].interactiveLearning
    };
}) satisfies PageServerLoad;
