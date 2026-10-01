import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AgentTranscriptService } from '$lib/server/agent/AgentTranscriptService';
import { DBStaffAgentUtils, StaffAgentAuthUtils } from '$lib/server/db/staff-agent';

export const GET: RequestHandler = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const record = await DBStaffAgentUtils.getThreadWithWorkspace(params.threadId);
	if (!record || record.thread.deletedAt) {
		return json({ error: 'Hilo no encontrado' }, { status: 404 });
	}

	const access = await StaffAgentAuthUtils.userCanAccessWorkspace(
		user.id,
		user.highestRoleLevel,
		record.workspace
	);
	if (!access.allowed) {
		return json({ error: access.reason ?? 'Sin acceso a este hilo' }, { status: 403 });
	}

	return json({
		messages: await AgentTranscriptService.getDisplayMessages(record.thread.chatId)
	});
};
