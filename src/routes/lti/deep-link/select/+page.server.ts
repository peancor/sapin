import { and, eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { requireValidDeepLinkSession } from '$lib/server/lti/launch';
import { getSelectableActivitiesForCourse } from '$lib/server/lti/deepLinking';
import type { PageServerLoad } from './$types';

const TEACHER_ROLES = [
	table.courseRoleType.OWNER,
	table.courseRoleType.ADMIN,
	table.courseRoleType.TEACHER,
	table.courseRoleType.ASSISTANT
];

export const load: PageServerLoad = async ({ url }) => {
	const sessionId = url.searchParams.get('session');
	if (!sessionId) error(400, 'Falta la sesión Deep Linking.');

	const session = await requireValidDeepLinkSession(sessionId);
	if (!session.teacherUserId)
		error(403, 'La sesión Deep Linking no está vinculada a un docente Sapin.');

	const courses = await db
		.select({
			id: table.course.id,
			name: table.course.name,
			status: table.course.status
		})
		.from(table.courseRole)
		.innerJoin(table.course, eq(table.courseRole.courseId, table.course.id))
		.where(
			and(
				eq(table.courseRole.userId, session.teacherUserId),
				eq(table.courseRole.isActive, true),
				inArray(table.courseRole.role, TEACHER_ROLES)
			)
		)
		.orderBy(table.course.name);

	const selectedCourseId = url.searchParams.get('courseId') ?? courses[0]?.id ?? null;
	const activities = selectedCourseId
		? await getSelectableActivitiesForCourse(selectedCourseId)
		: [];

	return {
		sessionId,
		courses,
		selectedCourseId,
		activities
	};
};
