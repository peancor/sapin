import { json } from '@sveltejs/kit';
import { getPublicJwks } from '$lib/server/lti/keys';

export async function GET() {
	return json(await getPublicJwks(), {
		headers: {
			'cache-control': 'public, max-age=300'
		}
	});
}
