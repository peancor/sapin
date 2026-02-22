import type { PageServerLoad } from './$types';

export const load = (async ({ parent, params }) => {
    const parentData = await parent();

    return {
        ...parentData,
        courseId: params.cid
    };
}) satisfies PageServerLoad;
