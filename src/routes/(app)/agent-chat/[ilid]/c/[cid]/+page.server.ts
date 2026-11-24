import type { PageServerLoad } from './$types';
import { authorizeConversation } from '$lib/server/conversation/transcript';
import { error } from '@sveltejs/kit';
import { AgentTranscriptService } from '$lib/server/agent';

export const load = (async ({ params, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Not authenticated');

	const { ilid, cid } = params;

	const attempt = await authorizeConversation(user, ilid, cid);
	if (attempt.type !== 'agent') error(404);
	const displayMessages = await AgentTranscriptService.getDisplayMessages(cid);

	return {
		chatId: cid,
		activityId: ilid,
		messages: displayMessages,
		interactiveLearning: { name: attempt.title },
		isOwner: attempt.isOwner,
		completed: attempt.agentFinalized,
		user: {
			username: user.username ?? undefined,
			alias: user.alias ?? undefined
		}
	};
}) satisfies PageServerLoad;
