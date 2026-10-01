import { radarHandler } from '$lib/server/radar/http';
export const GET = radarHandler('snapshot');
export const PATCH = radarHandler('patch');
