import type { PageServerLoad } from './$types';

export const load = (async ({ parent }) => {
    // Data is already loaded in the layout
    const parentData = await parent();

    return {
        ...parentData
    };
}) satisfies PageServerLoad;
