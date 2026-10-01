import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { AgentTranscriptService } from '$lib/server/agent/AgentTranscriptService';
import { DBStaffAgentUtils } from '$lib/server/db/staff-agent';
import { StaffAgentRuntimeService } from '$lib/server/staff-agent';

export const load = (async ({ parent, locals, url }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const { course } = await parent();
	const workspace = await DBStaffAgentUtils.getOrCreateCourseWorkspace(course.id);
	const config = await DBStaffAgentUtils.getWorkspaceConfigDTO(workspace.id);
	const threads = await DBStaffAgentUtils.listThreadsForWorkspace(workspace.id);
	const requestedThreadId = url.searchParams.get('thread');
	const selectedThreadSummary =
		(requestedThreadId ? threads.find((thread) => thread.id === requestedThreadId) : null) ?? threads[0] ?? null;

	const selectedThread = selectedThreadSummary
		? {
				...selectedThreadSummary,
				messages: await AgentTranscriptService.getDisplayMessages(selectedThreadSummary.chatId)
			}
		: null;

	return {
		courseId: course.id,
		title: `Agente del curso · ${course.name}`,
		description:
			'Consulta el estado del curso, detecta alumnado destacado o con riesgo y trabaja con hilos compartidos del staff.',
		workspace: config,
		threads,
		selectedThread,
		models: await StaffAgentRuntimeService.getModels(),
		availableTools: await StaffAgentRuntimeService.getAvailableToolsForWorkspace(workspace.id),
		apiBasePath: `/api/admin/staff-agent`,
		settingsHref: `/course/${course.id}/admin/course-agent/settings`,
		newThreadLabel: 'Nuevo hilo de curso',
		viewerUser: {
			username: locals.user.username ?? locals.user.email ?? undefined,
			alias: locals.user.alias ?? undefined
		}
	};
}) satisfies PageServerLoad;
