import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { LoginUtils, DBUserUtils, DBChatUtils, CourseRoleUtils } from '$lib/server/db';
import { resolveExternalIdSearchParam } from '$lib/server/students/externalIdSearchParam';
import { resolveMoodleLinkVerification } from '$lib/server/students/moodleLinkVerification';

export const load = (async (event) => {
	const { interactiveLearningId } = event.params;
	const moodleLinkVerification = await resolveMoodleLinkVerification({
		activityId: interactiveLearningId,
		expectedActivityType: 'chat',
		searchParams: event.url.searchParams,
		user: event.locals.user
	});
	if (moodleLinkVerification) {
		return { moodleLinkVerification, chatId: null, courseId: null };
	}

	const externalId = resolveExternalIdSearchParam(event.url.searchParams);
	if (!externalId) {
		error(401, 'Unauthorized');
	}

	// 1. Login user with externalId by updating session
	const userId = await DBUserUtils.existsUserWithExternalId(externalId);

	if (!userId) {
		error(401, 'User not found');
	}

	const user = await LoginUtils.loginUserWithExternalId(event, externalId);

	if (!user) {
		error(401, 'User not found');
	}

	// 2. Load activity
	let interactiveChat;
	try {
		interactiveChat = await DBChatUtils.loadInteractiveChatFromInteractiveId(interactiveLearningId);
	} catch (err) {
		console.error('Error loading interactive chat:', err);
		error(404, 'Actividad no encontrada o no disponible');
	}

	if (!interactiveChat) {
		error(404, 'Activity Learning Chat not found');
	}

	// 2b. Verificar que la actividad no esté cerrada (no se pueden crear nuevos chats)
	if (interactiveChat.interactive_learning.status === 'closed') {
		error(
			403,
			'Esta actividad está cerrada y no admite nuevas interacciones. Puedes consultar tu historial si ya participaste anteriormente.'
		);
	}

	// 3. Check if user is enrolled in the course
	const course = interactiveChat.course;
	if (course) {
		const userCourseRole = await CourseRoleUtils.getUserHighestCourseRole(userId, course.id);
		if (!userCourseRole) {
			error(403, 'User not enrolled in this course');
		}
	}

	// 4. Start new chat with api/interactive-chat/[iid]
	const response = await event.fetch(
		`/api/interactive-chat/${interactiveChat.interactive_learning.id}/chat`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({})
		}
	);

	const data = await response.json();

	if (data.error) {
		console.error('Error creating chat:', data.error);
		error(500, 'Error al crear el chat');
	}
	const chatId = data.chatId;
	console.log('New chat ChatId:', chatId);

	// Return the chat information
	return { moodleLinkVerification: null, chatId, courseId: course?.id };
}) satisfies PageServerLoad;
