import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db, InteractiveChatAuthUtils } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { AgentSessionAnalyticsService, AgentTranscriptService } from '$lib/server/agent';

export const load = (async ({ params, locals }) => {
	const currentUser = locals.user;
	if (!currentUser) throw error(401, 'Not authenticated');

	const { ilid, cid } = params;

	const canViewAll = await InteractiveChatAuthUtils.userCanViewAllChats(
		currentUser.id,
		ilid,
		currentUser.highestRoleLevel
	);

	if (!canViewAll) {
		throw error(
			403,
			'No autorizado: Solo profesores del curso y administradores pueden ver esta sesión'
		);
	}

	const chatData = await db.select().from(schema.chat).where(eq(schema.chat.id, cid)).get();
	if (!chatData) throw error(404, 'Chat not found');

	const userChatRelation = await db
		.select()
		.from(schema.userInteractiveLearningChat)
		.where(eq(schema.userInteractiveLearningChat.chatId, cid))
		.get();

	if (!userChatRelation || userChatRelation.interactiveLearningChatId !== ilid) {
		throw error(404, 'Agent session not found for this activity');
	}

	const studentData = await db
		.select()
		.from(schema.user)
		.where(eq(schema.user.id, userChatRelation.userId))
		.get();

	if (!studentData) throw error(404, 'Student not found');

	const activityData = await db
		.select()
		.from(schema.interactiveLearning)
		.where(eq(schema.interactiveLearning.id, ilid))
		.get();

	if (!activityData || activityData.type !== 'agent') {
		throw error(404, 'Agent activity not found');
	}

	const courseIds = await InteractiveChatAuthUtils.getInteractiveLearningCourses(ilid);
	const messages = await AgentTranscriptService.getDisplayMessages(cid);
	const sessionSummary = await AgentSessionAnalyticsService.getSessionAnalytics(cid);

	return {
		chatId: cid,
		messages,
		sessionSummary,
		student: {
			id: studentData.id,
			username: studentData.username || 'Unknown',
			email: studentData.email,
			image: studentData.image,
			alias: studentData.alias
		},
		activity: {
			id: activityData.id,
			name: activityData.name,
			description: activityData.description,
			type: activityData.type,
			image: activityData.image
		},
		createdAt: chatData.createdAt,
		updatedAt: chatData.updatedAt,
		reviewCourseId: courseIds[0] ?? null
	};
}) satisfies PageServerLoad;
