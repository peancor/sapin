import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DBStaffAgentUtils, StaffAgentAuthUtils } from '$lib/server/db/staff-agent';

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const record = await DBStaffAgentUtils.getThreadWithWorkspace(params.threadId);
	if (!record) return json({ error: 'Hilo no encontrado' }, { status: 404 });

	const access = await StaffAgentAuthUtils.userCanAccessWorkspace(
		user.id,
		user.highestRoleLevel,
		record.workspace
	);
	if (!access.allowed) {
		return json({ error: access.reason ?? 'Sin acceso a este hilo' }, { status: 403 });
	}

	try {
		const body = (await request.json()) as {
			title?: string | null;
			summary?: string | null;
			status?: 'draft' | 'active' | 'paused' | 'completed';
		};

		if (body.title !== undefined) {
			await DBStaffAgentUtils.renameThread(params.threadId, body.title);
		}

		if (body.summary !== undefined || body.status !== undefined) {
			await DBStaffAgentUtils.updateThread(params.threadId, {
				summary: body.summary ?? record.thread.summary,
				status: body.status ?? record.thread.status
			});
		}

		return json({
			thread: await DBStaffAgentUtils.getThread(params.threadId)
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'No se pudo actualizar el hilo' },
			{ status: 400 }
		);
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const record = await DBStaffAgentUtils.getThreadWithWorkspace(params.threadId);
	if (!record) return json({ error: 'Hilo no encontrado' }, { status: 404 });

	const access = await StaffAgentAuthUtils.userCanAccessWorkspace(
		user.id,
		user.highestRoleLevel,
		record.workspace
	);
	if (!access.allowed) {
		return json({ error: access.reason ?? 'Sin acceso a este hilo' }, { status: 403 });
	}

	await DBStaffAgentUtils.softDeleteThread(params.threadId, user.id);
	return json({ success: true });
};
