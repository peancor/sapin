import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DBStaffAgentUtils, StaffAgentAuthUtils } from '$lib/server/db/staff-agent';

export const GET: RequestHandler = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const workspace = await DBStaffAgentUtils.getWorkspaceById(params.workspaceId);
	if (!workspace) return json({ error: 'Workspace no encontrado' }, { status: 404 });

	const access = await StaffAgentAuthUtils.userCanAccessWorkspace(
		user.id,
		user.highestRoleLevel,
		workspace
	);
	if (!access.allowed) {
		return json({ error: access.reason ?? 'Sin acceso a este workspace' }, { status: 403 });
	}

	return json({
		threads: await DBStaffAgentUtils.listThreadsForWorkspace(workspace.id)
	});
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const workspace = await DBStaffAgentUtils.getWorkspaceById(params.workspaceId);
	if (!workspace) return json({ error: 'Workspace no encontrado' }, { status: 404 });

	const access = await StaffAgentAuthUtils.userCanAccessWorkspace(
		user.id,
		user.highestRoleLevel,
		workspace
	);
	if (!access.allowed) {
		return json({ error: access.reason ?? 'Sin acceso a este workspace' }, { status: 403 });
	}

	let title: string | null | undefined;
	try {
		const body = (await request.json()) as { title?: string | null };
		title = body.title;
	} catch {
		title = null;
	}

	const thread = await DBStaffAgentUtils.createThread({
		workspaceId: workspace.id,
		userId: user.id,
		title
	});

	return json({ thread }, { status: 201 });
};
