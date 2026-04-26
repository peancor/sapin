import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const lessonView = await LessonService.getSessionView({
			sessionId: params.sessionId,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid,
			skipAutoAgentExecution: true
		});
		if (
			lessonView.currentBlock.kind === 'agent' &&
			lessonView.currentBlock.agentConfig.runtimeMode === 'agent'
		) {
			return createLessonSseError(
				'Este bloque usa el runtime agéntico y debe consumirse por /agent-chat.',
				409
			);
		}

		const autoStart = url.searchParams.get('autoStart') === 'true';
		const message = url.searchParams.get('message') ?? undefined;
		if (!autoStart && !message?.trim()) {
			return createLessonSseError('Missing message');
		}

		const streamSession = await LessonService.createAgentResponseStream({
			sessionId: params.sessionId,
			blockId: params.blockId,
			message,
			autoStart,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid
		});

		const encoder = new TextEncoder();
		let assistantMessage = '';

		const stream = new ReadableStream({
			async start(controller) {
				try {
					controller.enqueue(encoder.encode('data: {"text":""}\n\n'));

					for await (const chunk of streamSession.textStream) {
						assistantMessage += chunk;
						controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
					}

					await streamSession.complete(assistantMessage);
					controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				} catch (error) {
					const message =
						error instanceof LessonServiceError
							? error.message
							: error instanceof Error
								? error.message
								: 'Error procesando la respuesta del bloque IA';
					if (autoStart) {
						await streamSession.fail(message);
					}
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
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
		if (error instanceof LessonServiceError) {
			return createLessonSseError(error.message);
		}

		console.error('[lesson] agent stream error', error);
		return createLessonSseError('Internal server error');
	}
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const lessonView = await LessonService.getSessionView({
			sessionId: params.sessionId,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid,
			skipAutoAgentExecution: true
		});
		if (
			lessonView.currentBlock.kind === 'agent' &&
			lessonView.currentBlock.agentConfig.runtimeMode === 'agent'
		) {
			return json(
				{ error: 'Este bloque usa el runtime agéntico y debe consumirse por /agent-chat.' },
				{ status: 409 }
			);
		}

		const payload = (await request.json().catch(() => ({}))) as { message?: string };
		if (!payload.message) {
			return json({ error: 'Missing message' }, { status: 400 });
		}

		const result = await LessonService.submitAgentTurn({
			sessionId: params.sessionId,
			blockId: params.blockId,
			message: payload.message,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid
		});

		return json({
			sessionId: result.session.id,
			assistantMessage: result.assistantMessage,
			outputs: result.outputs
		});
	} catch (error) {
		if (error instanceof LessonServiceError) {
			return json({ error: error.message }, { status: error.status });
		}

		console.error('[lesson] agent error', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

function createLessonSseError(message: string, status = 400): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
			controller.enqueue(encoder.encode('data: [DONE]\n\n'));
			controller.close();
		}
	});

	return new Response(stream, {
		status,
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
