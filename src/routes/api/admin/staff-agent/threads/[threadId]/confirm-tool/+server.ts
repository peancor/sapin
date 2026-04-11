import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DBAgentMessageUtils } from '$lib/server/db/agent';
import { DBStaffAgentUtils, StaffAgentAuthUtils } from '$lib/server/db/staff-agent';
import { ToolExecutor } from '$lib/server/agent/ToolExecutor';
import { StaffAgentRuntimeService } from '$lib/server/staff-agent';

export const POST: RequestHandler = async ({ params, locals, request }) => {
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

	let body: { toolCallId: string; approved: boolean; rejectionReason?: string };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'Body JSON invalido' }, { status: 400 });
	}

	const toolCall = await DBAgentMessageUtils.getToolCall(body.toolCallId);
	if (!toolCall) return json({ error: 'Tool call no encontrado' }, { status: 404 });

	if (toolCall.status !== 'awaiting_confirmation') {
		return json(
			{ error: `Tool call en estado "${toolCall.status}", no se puede confirmar` },
			{ status: 409 }
		);
	}

	const now = new Date();

	if (!body.approved) {
		await DBAgentMessageUtils.updateToolCall(body.toolCallId, {
			status: 'rejected',
			errorMessage: body.rejectionReason ?? 'Rechazado por el usuario',
			confirmedAt: now
		});

		await DBAgentMessageUtils.saveAgentMessage({
			chatId: record.thread.chatId,
			role: 'tool',
			textContent: JSON.stringify({
				rejected: true,
				reason: body.rejectionReason ?? 'El usuario rechazo la ejecucion de la herramienta.'
			}),
			toolCallId: body.toolCallId,
			toolName: toolCall.toolName,
			sequenceOrder: 3
		});

		await DBStaffAgentUtils.touchThread(record.thread.id, { status: 'paused' });
		return json({ success: true, rejected: true });
	}

	await DBAgentMessageUtils.updateToolCall(body.toolCallId, {
		status: 'executing',
		confirmedBy: user.id,
		confirmedAt: now
	});

	const runtime = await StaffAgentRuntimeService.buildRuntime({
		workspaceId: record.workspace.id,
		userId: user.id,
		userHighestRoleLevel: user.highestRoleLevel,
		chatId: record.thread.chatId
	});

	let toolArgs: Record<string, unknown> = {};
	try {
		toolArgs = JSON.parse(toolCall.arguments) as Record<string, unknown>;
	} catch {
		// ignore invalid JSON persisted previously
	}

	const execResult = await ToolExecutor.execute(
		toolCall.toolName,
		toolArgs,
		runtime.context,
		body.toolCallId
	);

	const resultData = execResult.success ? execResult.data : { error: execResult.errorMessage };
	await DBAgentMessageUtils.updateToolCall(body.toolCallId, {
		result: JSON.stringify(resultData),
		status: execResult.success ? 'completed' : 'failed',
		errorMessage: execResult.success ? undefined : execResult.errorMessage
	});

	await DBAgentMessageUtils.saveAgentMessage({
		chatId: record.thread.chatId,
		role: 'tool',
		textContent: JSON.stringify(resultData),
		toolCallId: body.toolCallId,
		toolName: toolCall.toolName,
		sequenceOrder: 3
	});
	await DBStaffAgentUtils.touchThread(record.thread.id, { status: 'paused' });

	return json({
		success: true,
		result: resultData,
		displayText: execResult.displayText
	});
};
