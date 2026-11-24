import { authorizeConversation, readConversation } from '$lib/server/conversation/transcript';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
	const attempt = await authorizeConversation(locals.user, params.ilid, params.cid);
	setHeaders({ 'cache-control': 'private, no-store' });
	return {
		classic: attempt.type === 'chat',
		title: attempt.title,
		createdAt: attempt.createdAt,
		messages: await readConversation(attempt.type, params.cid),
		ilid: params.ilid,
		cid: params.cid
	};
};
