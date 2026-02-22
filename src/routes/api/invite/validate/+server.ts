import { json, type RequestHandler } from '@sveltejs/kit';
import { InvitationUtils } from '$lib/server/db';
import { sn } from '$lib/server/sn';

/**
 * GET /api/invite/validate?code=XXXX-XXXX-XXXX-XXXX
 * Returns public info about an invite code (for registration page)
 */
export const GET: RequestHandler = async ({ url }) => {
    const code = url.searchParams.get('code');

    if (!code || !sn.validateSerialNumber(code)) {
        return json({ valid: false }, { status: 400 });
    }

    const info = await InvitationUtils.getInvitePublicInfo(code);

    if (!info) {
        return json({ valid: false });
    }

    return json({
        valid: true,
        type: info.type,
        courseName: info.courseName,
        welcomeMessage: info.welcomeMessage
    });
};
