import { radarActionHandler } from '$lib/server/radar/actionHttp';
export const GET = radarActionHandler('history');
export const POST = radarActionHandler('execute');
