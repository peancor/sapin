import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { authorizeConversation } from '$lib/server/conversation/transcript';
import { message } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export const load = (async ({ params, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Not authenticated');

	const chatInstance = params.cid;
	const { ilid } = params;

	const attempt = await authorizeConversation(user, ilid, chatInstance);
	if (attempt.type !== 'chat') error(404);

	// Fetch messages for this chat instance
	const messages = await db
		.select()
		.from(message)
		.where(eq(message.chatId, chatInstance))
		.orderBy(message.createdAt);

	return {
		chatInstance,
		messages,
		isOwner: attempt.isOwner
	};
}) satisfies PageServerLoad;
