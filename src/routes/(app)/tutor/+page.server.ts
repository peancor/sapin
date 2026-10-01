import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { DBAgentActivityUtils } from '$lib/server/db/agent';

export const load = (async ({ locals, fetch }) => {
    const user = locals.user;
    if (!user) throw redirect(302, '/login');

    // Seed global tutor if not yet seeded
    await DBAgentActivityUtils.seedGlobalTutor();

    // Get or create the tutor chat
    const chatId = await DBAgentActivityUtils.getOrCreateTutorChat(user.id);

    // Redirect to the chat page
    throw redirect(302, `/tutor/c/${chatId}`);
}) satisfies PageServerLoad;
