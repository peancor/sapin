import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isPromptSafe } from '$lib/server/utils/moderation';
import { MODERATE_PROMPTS } from '$env/static/private';
import { DBStaffAgentUtils, StaffAgentAuthUtils } from '$lib/server/db/staff-agent';
import { StaffAgentEngine, StaffAgentRuntimeService } from '$lib/server/staff-agent';

function sseError(message: string): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(
				encoder.encode(
					`data: ${JSON.stringify({ type: 'error', code: 'REQUEST_ERROR', message })}\n\n`
				)
			);
			controller.enqueue(encoder.encode('data: [DONE]\n\n'));
			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache'
		}
	});
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const record = await DBStaffAgentUtils.getThreadWithWorkspace(params.threadId);
	if (!record || record.thread.deletedAt) {
		return sseError('Hilo no encontrado');
	}

	const access = await StaffAgentAuthUtils.userCanAccessWorkspace(
		user.id,
		user.highestRoleLevel,
		record.workspace
	);
	if (!access.allowed) {
		return sseError(access.reason ?? 'Sin acceso a este hilo');
	}

	const userMessage = url.searchParams.get('message');
	const isResume = url.searchParams.get('resume') === 'true';

	if (!isResume && !userMessage?.trim()) {
		return sseError('Falta el mensaje a enviar');
	}

	let finalUserMessage = userMessage?.trim() ?? '';
	if (!isResume && MODERATE_PROMPTS === 'true') {
		const isSafe = await isPromptSafe(finalUserMessage);
		if (!isSafe) {
			finalUserMessage = '[[El contenido enviado fue moderado por contener lenguaje inapropiado]]';
		}
	}

	try {
		const runtime = await StaffAgentRuntimeService.buildRuntime({
			workspaceId: record.workspace.id,
			userId: user.id,
			userHighestRoleLevel: user.highestRoleLevel,
			chatId: record.thread.chatId
		});

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			async start(controller) {
				try {
					const generator = isResume
						? StaffAgentEngine.resumeFromToolCall({
								threadId: record.thread.id,
								context: runtime.context,
								systemPrompt: runtime.systemPrompt
							})
						: StaffAgentEngine.executeLoop({
								threadId: record.thread.id,
								context: runtime.context,
								systemPrompt: runtime.systemPrompt,
								userMessage: finalUserMessage
							});

					for await (const part of generator) {
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`));
					}
					controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				} catch (error) {
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({
								type: 'error',
								code: 'INTERNAL_ERROR',
								message:
									error instanceof Error ? error.message : 'Error interno del servidor'
							})}\n\n`
						)
					);
					controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				} finally {
					controller.close();
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no'
			}
		});
	} catch (error) {
		return sseError(error instanceof Error ? error.message : 'Error interno del servidor');
	}
};
