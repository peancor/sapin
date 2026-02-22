import * as auth from '$lib/server/auth';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { fail, type ServerLoadEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm'

export default class LoginUtils {

    //Logs a user in only with email
    static async loginUser(event: ServerLoadEvent, email: string) {

        // Check only email field
        const [user] = await db
            .select()
            .from(table.user)
            .where(eq(table.user.email, email));

        if (!user) {
            return fail(400, { message: 'Invalid credentials' });
        }

        const sessionToken = auth.generateSessionToken();
        const session = await auth.createSession(sessionToken, user.id);
        auth.setSessionTokenCookie(event, sessionToken, session.expiresAt)
    }

    static async loginUserWithExternalId(event: ServerLoadEvent, externalId: string) {

        // Check only email field
        const [user] = await db
            .select()
            .from(table.user)
            .where(eq(table.user.externalId, externalId));

        if (!user) {
            return fail(400, { message: 'Invalid credentials' });
        }

        const sessionToken = auth.generateSessionToken();
        const session = await auth.createSession(sessionToken, user.id);
        auth.setSessionTokenCookie(event, sessionToken, session.expiresAt)
        return user;
    }
}
