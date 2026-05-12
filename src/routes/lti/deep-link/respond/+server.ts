import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { buildDeepLinkContentItem, buildDeepLinkResponseJwt } from '$lib/server/lti/deepLinking';
import { getPublicOrigin } from '$lib/server/lti/config';
import { requireValidDeepLinkSession } from '$lib/server/lti/launch';
import { markDeepLinkSessionUsed } from '$lib/server/lti/store';
import { getActivityForLti } from '$lib/server/lti/runtime';
import type { RequestEvent } from './$types';

const TEACHER_ROLES = [
	table.courseRoleType.OWNER,
	table.courseRoleType.ADMIN,
	table.courseRoleType.TEACHER,
	table.courseRoleType.ASSISTANT
] as string[];

async function getPlatformAndDeployment(session: table.LtiDeepLinkSession) {
	const [row] = await db
		.select({
			platform: table.ltiPlatformRegistration,
			deployment: table.ltiDeployment
		})
		.from(table.ltiPlatformRegistration)
		.innerJoin(
			table.ltiDeployment,
			eq(table.ltiDeployment.platformId, table.ltiPlatformRegistration.id)
		)
		.where(
			and(
				eq(table.ltiPlatformRegistration.id, session.platformId),
				eq(table.ltiDeployment.id, session.deploymentId),
				eq(table.ltiPlatformRegistration.status, table.ltiRegistrationStatus.ACTIVE),
				eq(table.ltiDeployment.status, table.ltiDeploymentStatus.ACTIVE)
			)
		)
		.limit(1);

	if (!row) error(400, 'La plataforma o deployment LTI ya no están activos.');
	return row;
}

async function assertTeacherCanPublish(session: table.LtiDeepLinkSession, courseId: string) {
	if (!session.teacherUserId) error(403, 'La sesión no está vinculada a un docente Sapin.');
	const [role] = await db
		.select()
		.from(table.courseRole)
		.where(
			and(
				eq(table.courseRole.userId, session.teacherUserId),
				eq(table.courseRole.courseId, courseId),
				eq(table.courseRole.isActive, true)
			)
		)
		.limit(1);

	if (!role || !TEACHER_ROLES.includes(role.role)) {
		error(403, 'No tienes permisos docentes para publicar actividades de este curso.');
	}
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

export async function POST(event: RequestEvent) {
	const form = await event.request.formData();
	const sessionId = form.get('session');
	const courseId = form.get('courseId');
	const activityId = form.get('activityId');
	const enableGradebook = form.get('enableGradebook') === 'on';

	if (
		typeof sessionId !== 'string' ||
		typeof courseId !== 'string' ||
		typeof activityId !== 'string'
	) {
		error(400, 'Faltan datos para construir la respuesta Deep Linking.');
	}

	const session = await requireValidDeepLinkSession(sessionId);
	await assertTeacherCanPublish(session, courseId);
	const activity = await getActivityForLti(courseId, activityId);
	const { platform, deployment } = await getPlatformAndDeployment(session);
	const contentItem = buildDeepLinkContentItem({
		origin: getPublicOrigin(event.url),
		courseId,
		activityId,
		title: activity.name,
		enableGradebook
	});
	const jwt = await buildDeepLinkResponseJwt({
		platform,
		deployment,
		origin: getPublicOrigin(event.url),
		data: session.data,
		contentItems: [contentItem]
	});

	await markDeepLinkSessionUsed(session.id);

	const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Volviendo a Moodle</title></head>
<body>
<form id="lti-deep-link-response" method="post" action="${escapeHtmlAttribute(session.deepLinkReturnUrl)}">
<input type="hidden" name="JWT" value="${escapeHtmlAttribute(jwt)}">
</form>
<script>document.getElementById('lti-deep-link-response').submit();</script>
</body>
</html>`;

	return new Response(html, {
		headers: {
			'content-type': 'text/html; charset=utf-8'
		}
	});
}
