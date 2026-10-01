import { CourseInteractiveAuthUtils, CourseRoleUtils } from '$lib/server/db';
import type { StaffAgentWorkspace } from '$lib/server/db/schema';
import { ROLE_LEVELS } from '$lib/server/roles';
import DBStaffAgentUtils, { STAFF_AGENT_FEATURE_KEY, STAFF_AGENT_SCOPE_TYPE } from './DBStaffAgentUtils';

const STAFF_ROLES = ['owner', 'admin', 'teacher', 'assistant'] as const;

interface AccessResult {
	allowed: boolean;
	reason?: string;
	isSystemAdmin: boolean;
	courseRole?: string;
}

async function userCanAccessCourseStaffAgent(
	userId: string,
	courseId: string,
	userSystemRoleLevel: number
): Promise<AccessResult> {
	if (userSystemRoleLevel >= ROLE_LEVELS.ADMIN) {
		return { allowed: true, isSystemAdmin: true };
	}

	const courseRole = await CourseRoleUtils.getUserHighestCourseRole(userId, courseId);
	if (!courseRole) {
		return {
			allowed: false,
			isSystemAdmin: false,
			reason: 'No tienes rol en este curso'
		};
	}

	if (!STAFF_ROLES.includes(courseRole.role as (typeof STAFF_ROLES)[number])) {
		return {
			allowed: false,
			isSystemAdmin: false,
			courseRole: courseRole.role,
			reason: 'No tienes permisos de staff para este curso'
		};
	}

	return {
		allowed: true,
		isSystemAdmin: false,
		courseRole: courseRole.role
	};
}

async function userCanAccessActivityStaffAgent(
	userId: string,
	courseId: string,
	interactiveLearningId: string,
	userSystemRoleLevel: number
): Promise<AccessResult> {
	return CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
		userId,
		courseId,
		interactiveLearningId,
		userSystemRoleLevel
	);
}

async function userCanAccessWorkspace(
	userId: string,
	userSystemRoleLevel: number,
	workspace: Pick<StaffAgentWorkspace, 'featureKey' | 'scopeType' | 'scopeId'>
) {
	if (workspace.featureKey !== STAFF_AGENT_FEATURE_KEY) {
		return {
			allowed: false,
			isSystemAdmin: false,
			reason: 'Workspace no compatible con staff-agent'
		};
	}

	if (workspace.scopeType === STAFF_AGENT_SCOPE_TYPE.ACTIVITY) {
		const courseId = await DBStaffAgentUtils.resolveCourseIdForActivity(workspace.scopeId);
		if (!courseId) {
			return {
				allowed: false,
				isSystemAdmin: false,
				reason: 'Actividad no asociada a un curso'
			};
		}

		return userCanAccessActivityStaffAgent(
			userId,
			courseId,
			workspace.scopeId,
			userSystemRoleLevel
		);
	}

	if (workspace.scopeType === STAFF_AGENT_SCOPE_TYPE.COURSE) {
		return userCanAccessCourseStaffAgent(userId, workspace.scopeId, userSystemRoleLevel);
	}

	return {
		allowed: false,
		isSystemAdmin: false,
		reason: 'Tipo de scope no soportado para staff-agent'
	};
}

export const StaffAgentAuthUtils = {
	STAFF_ROLES,
	userCanAccessCourseStaffAgent,
	userCanAccessActivityStaffAgent,
	userCanAccessWorkspace
};

export default StaffAgentAuthUtils;
