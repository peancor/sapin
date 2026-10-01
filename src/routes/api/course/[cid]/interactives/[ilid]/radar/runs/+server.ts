import { radarHandler } from '$lib/server/radar/http';
export const GET = radarHandler('list');
export const POST = radarHandler('create');
