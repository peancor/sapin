import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import DBAgentUtils from '$lib/server/db/DBAgentUtils';

export const load = (async ({ locals, fetch }) => {
    const user = locals.user;
    if (!user) throw redirect(302, '/login');

    // Seed global tutor if not yet seeded
    await DBAgentUtils.seedGlobalTutor();

    // Get or create the tutor chat
    const chatId = await DBAgentUtils.getOrCreateTutorChat(user.id);

    // Redirect to the chat page
    throw redirect(302, `/tutor/c/${chatId}`);
}) satisfies PageServerLoad;
