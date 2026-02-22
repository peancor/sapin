import type { PageServerLoad } from './$types';
import { getCourseLearningAnalytics } from '$lib/server/db/LearningAnalyticsUtils';

export const load = (async ({ params }) => {
    const analytics = await getCourseLearningAnalytics(params.cid);

    return {
        courseId: params.cid,
        analytics
    };
}) satisfies PageServerLoad;
