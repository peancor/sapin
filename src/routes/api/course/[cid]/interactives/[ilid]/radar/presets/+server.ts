import { radarHandler } from '$lib/server/radar/http';
export const GET = radarHandler('presets');
export const POST = radarHandler('savePreset');
