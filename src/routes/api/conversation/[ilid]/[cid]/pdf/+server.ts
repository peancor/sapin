import { error } from '@sveltejs/kit';
import { getLocale, localizeHref } from '$lib/paraglide/runtime';
import { authorizeConversation } from '$lib/server/conversation/transcript';
import { renderConversationPdf } from '$lib/server/conversation/pdf';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, url, fetch }) => {
	const attempt = await authorizeConversation(locals.user, params.ilid, params.cid);
	if (!attempt.completed && !attempt.canReview) error(403, 'El intento aún no ha finalizado.');
	const path = localizeHref(
		'/conversation/' + encodeURIComponent(params.ilid) + '/' + encodeURIComponent(params.cid),
		{ locale: getLocale() }
	);
	const pdf = await renderConversationPdf(
		new URL(path, url.origin),
		fetch,
		getLocale(),
		params.ilid,
		attempt.isOwner ? undefined : attempt.ownerId
	);
	const name =
		(attempt.title
			.replace(/[\\/:*?"<>|\p{Cc}]/gu, ' ')
			.trim()
			.slice(0, 100) || 'Sapin') + '.pdf';
	return new Response(new Uint8Array(pdf), {
		headers: {
			'content-type': 'application/pdf',
			'cache-control': 'private, no-store',
			'content-disposition':
				'attachment; filename="conversation.pdf"; filename*=UTF-8\'\'' +
				encodeURIComponent(name).replace(/'/g, '%27')
		}
	});
};
