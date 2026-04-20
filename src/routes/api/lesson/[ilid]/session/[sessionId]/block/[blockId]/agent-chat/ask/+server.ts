import type { RequestHandler } from '@sveltejs/kit';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const user = locals.user;
	if (!user) {
		return createLessonAgentSseError('Unauthorized', 401);
	}

	const sessionId = params.sessionId;
	const blockId = params.blockId;
	if (!sessionId || !blockId) {
		return createLessonAgentSseError('Missing route params', 400);
	}

	const userMessage = url.searchParams.get('message') ?? undefined;
	const userMessageMetadata = url.searchParams.get('metadata') ?? undefined;
	const resume = url.searchParams.get('resume') === 'true';
	const autoStart = url.searchParams.get('autoStart') === 'true';

	try {
		const generator = await LessonService.createLessonAgentStream({
			sessionId,
			blockId,
			userId: user.id,
			userRoleLevel: user.highestRoleLevel,
			interactiveLearningId: params.ilid,
			message: userMessage,
			userMessageMetadata,
			autoStart,
			resume
		});

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			async start(controller) {
				try {
					for await (const part of generator) {
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`));
					}

					await LessonService.syncLessonAgentBlockOutputs({
						sessionId,
						blockId,
						userId: user.id,
						userRoleLevel: user.highestRoleLevel,
						interactiveLearningId: params.ilid
					});

					controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				} catch (error) {
					const message =
						error instanceof LessonServiceError
							? error.message
							: error instanceof Error
								? error.message
								: 'Error interno del servidor';
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({ type: 'error', code: 'INTERNAL_ERROR', message })}\n\n`
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
		if (error instanceof LessonServiceError) {
			return createLessonAgentSseError(error.message, error.status);
		}

		console.error('[lesson-agent] ask error', error);
		return createLessonAgentSseError('Internal server error', 500);
	}
};

function createLessonAgentSseError(message: string, status = 400): Response {
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
		status,
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache'
		}
	});
}
