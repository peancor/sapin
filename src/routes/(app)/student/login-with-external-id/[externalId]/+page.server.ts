import type { PageServerLoad } from './$types';
import { LoginUtils } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import { notifier } from '$lib/server/notifier';

export const load = (async (event) => {
    const { externalId } = event.params;

    try {
        await LoginUtils.loginUserWithExternalId(event, externalId);
        //await notifier.notify(`User logged in with external ID: ${externalId}`);
        return { loginSuccess: true };
    } catch (err) {
        console.error('Error logging in with external ID:', err);
        throw error(401, 'Invalid credentials');
    }
}) satisfies PageServerLoad;