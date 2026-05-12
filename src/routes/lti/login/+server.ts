import { redirectToPlatformLogin } from '$lib/server/lti/launch';
import type { RequestEvent } from './$types';

export async function GET(event: RequestEvent) {
	await redirectToPlatformLogin(event);
}
