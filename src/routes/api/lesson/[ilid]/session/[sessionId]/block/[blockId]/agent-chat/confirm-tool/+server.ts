import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { DBAgentMessageUtils } from '$lib/server/db/agent';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { ToolExecutor } from '$lib/server/agent/ToolExecutor';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const user = locals.user;
	if (!user) return new Response('Unauthorized', { status: 401 });

	const sessionId = params.sessionId;
	const blockId = params.blockId;
	if (!sessionId || !blockId) {
		return json({ error: 'Missing route params' }, { status: 400 });
	}

	let body: { toolCallId: string; approved: boolean; rejectionReason?: string };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'Body JSON inválido' }, { status: 400 });
	}

	const { toolCallId, approved, rejectionReason } = body;
	if (!toolCallId || typeof approved !== 'boolean') {
		return json({ error: 'toolCallId y approved son requeridos' }, { status: 400 });
	}

	try {
		const runtime = await LessonService.getLessonAgentRuntimeContext({
			sessionId,
			blockId,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid
		});

		const toolCall = await DBAgentMessageUtils.getToolCall(toolCallId);
		if (!toolCall) return json({ error: 'Tool call no encontrado' }, { status: 404 });

		const [message] = await db
			.select({
				chatId: schema.agentMessage.chatId
			})
			.from(schema.agentMessage)
			.where(eq(schema.agentMessage.id, toolCall.messageId))
			.limit(1);

		if (!message || message.chatId !== runtime.blockVisit.chatId) {
			return json({ error: 'Tool call fuera del chat activo de la lesson' }, { status: 403 });
		}

		if (toolCall.status !== 'awaiting_confirmation') {
			return json(
				{ error: `Tool call en estado "${toolCall.status}", no se puede confirmar` },
				{ status: 409 }
			);
		}

		const now = new Date();

		if (!approved) {
			await DBAgentMessageUtils.updateToolCall(toolCallId, {
				status: 'rejected',
				errorMessage: rejectionReason ?? 'Rechazado por el usuario',
				confirmedAt: now
			});

			await DBAgentMessageUtils.saveAgentMessage({
				chatId: runtime.blockVisit.chatId!,
				role: 'tool',
				textContent: JSON.stringify({
					rejected: true,
					reason: rejectionReason ?? 'El usuario rechazó la ejecución de la herramienta.'
				}),
				toolCallId,
				toolName: toolCall.toolName,
				sequenceOrder: 3
			});

			await LessonService.syncLessonAgentBlockOutputs({
				sessionId,
				blockId,
				userId: user.id,
				userRoleLevel: user.highestRoleLevel,
				interactiveLearningId: params.ilid
			});

			return json({ success: true, rejected: true });
		}

		await DBAgentMessageUtils.updateToolCall(toolCallId, {
			status: 'executing',
			confirmedBy: user.id,
			confirmedAt: now
		});

		let toolArgs: Record<string, unknown> = {};
		try {
			toolArgs = JSON.parse(toolCall.arguments) as Record<string, unknown>;
		} catch {
			// noop
		}

		const execResult = await ToolExecutor.execute(
			toolCall.toolName,
			toolArgs,
			runtime.context,
			toolCallId
		);
		const resultData = execResult.success ? execResult.data : { error: execResult.errorMessage };

		await DBAgentMessageUtils.updateToolCall(toolCallId, {
			result: JSON.stringify(resultData),
			status: execResult.success ? 'completed' : 'failed',
			errorMessage: execResult.success ? undefined : execResult.errorMessage
		});

		await DBAgentMessageUtils.saveAgentMessage({
			chatId: runtime.blockVisit.chatId!,
			role: 'tool',
			textContent: JSON.stringify(resultData),
			toolCallId,
			toolName: toolCall.toolName,
			sequenceOrder: 3
		});

		await LessonService.syncLessonAgentBlockOutputs({
			sessionId,
			blockId,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid
		});

		return json({
			success: true,
			result: resultData,
			displayText: execResult.displayText
		});
	} catch (error) {
		if (error instanceof LessonServiceError) {
			return json({ error: error.message }, { status: error.status });
		}

		console.error('[lesson-agent] confirm-tool error', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
