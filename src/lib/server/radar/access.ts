import CourseRoleUtils from '$lib/server/db/CourseRoleUtils';
import { getUserHighestRole } from '$lib/server/db/RoleUtils';
import { RadarError, type RadarRepository } from './RadarRepository';

export async function canUseRadar(userId: string, courseId: string): Promise<boolean> {
	if (((await getUserHighestRole(userId))?.level ?? 0) >= 90) return true;
	const role = await CourseRoleUtils.getUserHighestCourseRole(userId, courseId);
	return (
		!!role &&
		['owner', 'admin', 'teacher', 'assistant'].includes(role.role) &&
		(await CourseRoleUtils.userHasCoursePermission(userId, courseId, 'viewAnalytics'))
	);
}
export async function authorizeRadar(
	repository: RadarRepository,
	userId: string | undefined,
	courseId: string,
	activityId: string,
	hasPermission: (userId: string, courseId: string) => Promise<boolean> = canUseRadar
) {
	if (!userId) throw new RadarError(401, 'Inicia sesión para consultar el radar.');
	if (!(await hasPermission(userId, courseId)))
		throw new RadarError(403, 'No tienes permiso de analítica docente en este curso.');
	repository.activity(courseId, activityId);
}
