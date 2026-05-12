import { handleLaunchPost } from '$lib/server/lti/launch';
import type { RequestEvent } from './$types';

export async function POST(event: RequestEvent) {
	await handleLaunchPost(event);
}
