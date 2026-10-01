import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DBStaffAgentUtils, StaffAgentAuthUtils } from '$lib/server/db/staff-agent';
import { StaffAgentRuntimeService } from '$lib/server/staff-agent';

export const GET: RequestHandler = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const access = await StaffAgentAuthUtils.userCanAccessCourseStaffAgent(
		user.id,
		params.cid,
		user.highestRoleLevel
	);
	if (!access.allowed) {
		return json({ error: access.reason ?? 'Sin acceso al staff-agent del curso' }, { status: 403 });
	}

	const workspace = await DBStaffAgentUtils.getOrCreateCourseWorkspace(params.cid);
	const config = await DBStaffAgentUtils.getWorkspaceConfigDTO(workspace.id);
	const threads = await DBStaffAgentUtils.listThreadsForWorkspace(workspace.id);

	return json({
		workspace: config,
		threads
	});
};

export const PUT: RequestHandler = async ({ params, locals, request }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const access = await StaffAgentAuthUtils.userCanAccessCourseStaffAgent(
		user.id,
		params.cid,
		user.highestRoleLevel
	);
	if (!access.allowed) {
		return json({ error: access.reason ?? 'Sin acceso al staff-agent del curso' }, { status: 403 });
	}

	const workspace = await DBStaffAgentUtils.getOrCreateCourseWorkspace(params.cid);

	try {
		const body = (await request.json()) as {
			llmModel?: string | null;
			llmRole?: string | null;
			llmInstructions?: string | null;
			llmContext?: string | null;
			systemPrompt?: string | null;
			maxToolRoundtrips?: number;
			parallelToolCalls?: boolean;
			toolChoice?: 'auto' | 'required' | 'none';
			enabledToolIds?: string[];
		};

		await DBStaffAgentUtils.updateWorkspace(workspace.id, {
			llmModel: body.llmModel ?? workspace.llmModel,
			llmRole: body.llmRole ?? workspace.llmRole,
			llmInstructions: body.llmInstructions ?? workspace.llmInstructions,
			llmContext: body.llmContext ?? workspace.llmContext,
			systemPrompt: body.systemPrompt ?? workspace.systemPrompt,
			maxToolRoundtrips:
				typeof body.maxToolRoundtrips === 'number'
					? Math.max(1, Math.min(20, Math.round(body.maxToolRoundtrips)))
					: workspace.maxToolRoundtrips,
			parallelToolCalls:
				typeof body.parallelToolCalls === 'boolean'
					? body.parallelToolCalls
					: workspace.parallelToolCalls,
			toolChoice: body.toolChoice ?? workspace.toolChoice
		});

		if (Array.isArray(body.enabledToolIds)) {
			await DBStaffAgentUtils.setWorkspaceTools(workspace.id, body.enabledToolIds);
		}

		return json({
			workspace: await DBStaffAgentUtils.getWorkspaceConfigDTO(workspace.id),
			availableTools: await StaffAgentRuntimeService.getAvailableToolsForWorkspace(workspace.id)
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'No se pudo guardar el workspace' },
			{ status: 400 }
		);
	}
};
