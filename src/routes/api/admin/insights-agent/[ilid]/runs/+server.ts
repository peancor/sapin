import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CourseInteractiveAuthUtils } from '$lib/server/db';
import { DBInsightsAgentUtils } from '$lib/server/db/insights-agent';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Body JSON invalido' }, { status: 400 });
	}

	const courseId = body.courseId;
	if (typeof courseId !== 'string' || courseId.length === 0) {
		return json({ error: 'courseId es obligatorio' }, { status: 400 });
	}

	const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
		user.id,
		courseId,
		params.ilid,
		user.highestRoleLevel
	);
	if (!access.allowed) {
		return json({ error: access.reason || 'Sin permisos' }, { status: 403 });
	}

	const run = await DBInsightsAgentUtils.createRun({
		interactiveLearningId: params.ilid,
		userId: user.id,
		title: typeof body.title === 'string' ? body.title : null,
		scope:
			body.scope && typeof body.scope === 'object'
				? body.scope
				: DBInsightsAgentUtils.defaultScope()
	});

	return json({ run });
};
