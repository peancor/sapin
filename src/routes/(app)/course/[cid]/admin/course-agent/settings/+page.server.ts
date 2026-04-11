import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { DBStaffAgentUtils } from '$lib/server/db/staff-agent';
import { StaffAgentRuntimeService } from '$lib/server/staff-agent';

export const load = (async ({ parent, locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const { course } = await parent();
	const workspace = await DBStaffAgentUtils.getOrCreateCourseWorkspace(course.id);

	return {
		courseId: course.id,
		workspace: await DBStaffAgentUtils.getWorkspaceConfigDTO(workspace.id),
		models: await StaffAgentRuntimeService.getModels(),
		availableTools: await StaffAgentRuntimeService.getAvailableToolsForWorkspace(workspace.id),
		returnHref: `/course/${course.id}/admin/course-agent`,
		scopeLabel: `Curso · ${course.name}`,
		updateEndpoint: `/api/admin/staff-agent/workspaces/course/${course.id}`
	};
}) satisfies PageServerLoad;
