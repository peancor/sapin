import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const ADMIN_LEVEL = 90;

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user || locals.user.highestRoleLevel < ADMIN_LEVEL) {
        throw redirect(302, '/');
    }

    return {
        title: 'RAG Test Lab'
    };
};
