import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { DBStaffAgentUtils } from '$lib/server/db/staff-agent';
import { StaffAgentRuntimeService } from '$lib/server/staff-agent';

export const load = (async ({ parent, locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const { course, interactive } = await parent();
	const workspace = await DBStaffAgentUtils.getOrCreateActivityWorkspace(interactive.id, course.id);

	return {
		courseId: course.id,
		activityId: interactive.id,
		workspace: await DBStaffAgentUtils.getWorkspaceConfigDTO(workspace.id),
		models: await StaffAgentRuntimeService.getModels(),
		availableTools: await StaffAgentRuntimeService.getAvailableToolsForWorkspace(workspace.id),
		returnHref: `/course/${course.id}/admin/interactives/${interactive.id}/staff-agent`,
		scopeLabel: `Actividad · ${interactive.name}`,
		updateEndpoint: `/api/admin/staff-agent/workspaces/activity/${interactive.id}`
	};
}) satisfies PageServerLoad;
