import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, DBUserUtils, InteractiveChatAuthUtils, LoginUtils } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { DBAgentActivityUtils } from '$lib/server/db/agent';
import { resolveExternalIdSearchParam } from '$lib/server/students/externalIdSearchParam';
import { resolveMoodleLinkVerification } from '$lib/server/students/moodleLinkVerification';

export const load = (async (event) => {
	const { interactiveLearningId } = event.params;
	const moodleLinkVerification = await resolveMoodleLinkVerification({
		activityId: interactiveLearningId,
		expectedActivityType: 'agent',
		searchParams: event.url.searchParams,
		user: event.locals.user
	});
	if (moodleLinkVerification) {
		return { moodleLinkVerification, activityId: interactiveLearningId, chatId: null };
	}

	const externalId = resolveExternalIdSearchParam(event.url.searchParams);

	if (!externalId) {
		error(401, 'Unauthorized');
	}

	const userId = await DBUserUtils.existsUserWithExternalId(externalId);
	if (!userId) {
		error(401, 'User not found');
	}

	await LoginUtils.loginUserWithExternalId(event, externalId);

	const [interactiveLearning] = await db
		.select()
		.from(schema.interactiveLearning)
		.where(eq(schema.interactiveLearning.id, interactiveLearningId));

	if (!interactiveLearning || interactiveLearning.type !== 'agent') {
		error(404, 'Actividad agéntica no encontrada o no disponible');
	}

	const agentActivity = await DBAgentActivityUtils.getAgentActivity(interactiveLearningId);
	if (!agentActivity) {
		error(404, 'Actividad agéntica no encontrada o no disponible');
	}

	if (interactiveLearning.status === 'closed') {
		error(
			403,
			'Esta actividad está cerrada y no admite nuevas interacciones. Puedes consultar tu historial si ya participaste anteriormente.'
		);
	}

	if (interactiveLearning.status !== 'published') {
		error(404, 'Actividad agéntica no encontrada o no disponible');
	}

	const access = await InteractiveChatAuthUtils.userCanAccessInteractiveActivity(
		userId,
		interactiveLearningId,
		0
	);

	if (!access.allowed) {
		error(403, access.reason || 'User not enrolled in this course');
	}

	const response = await event.fetch(`/api/agent-chat/${interactiveLearningId}/chat`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			courseId: access.courseId
		})
	});

	const payload = (await response.json().catch(() => null)) as {
		chatId?: string;
		error?: string;
	} | null;

	if (!response.ok || !payload?.chatId) {
		console.error('Error creating agent chat:', payload?.error);
		error(500, 'Error al crear la sesión del agente');
	}

	return {
		moodleLinkVerification: null,
		activityId: interactiveLearningId,
		chatId: payload.chatId
	};
}) satisfies PageServerLoad;
