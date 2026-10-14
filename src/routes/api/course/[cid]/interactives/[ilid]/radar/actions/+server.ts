import { radarActionHandler } from '$lib/server/radar/actionHttp';
export const GET = radarActionHandler('list');
export const POST = radarActionHandler('create');
