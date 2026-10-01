import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InteractiveChatAuthUtils } from '$lib/server/db';
import { AgentMessageAttachmentService } from '$lib/server/agent/AgentMessageAttachmentService';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { ilcid, cid } = params;
	if (!ilcid || !cid) {
		return json({ error: 'Missing required parameters' }, { status: 400 });
	}

	const chatAccess = await InteractiveChatAuthUtils.userCanAccessChat(
		user.id,
		cid,
		ilcid,
		user.highestRoleLevel
	);
	if (!chatAccess.allowed) {
		return json({ error: chatAccess.reason || 'Sin acceso a este chat' }, { status: 403 });
	}

	try {
		const formData = await request.formData();
		const files = formData
			.getAll('files')
			.concat(formData.getAll('file'))
			.filter((value): value is File => value instanceof File && value.size > 0);

		if (files.length === 0) {
			return json({ error: 'No se recibieron imágenes.' }, { status: 400 });
		}

		if (files.length > AgentMessageAttachmentService.maxAttachmentsPerMessage) {
			return json(
				{
					error: `Puedes adjuntar como máximo ${AgentMessageAttachmentService.maxAttachmentsPerMessage} imágenes por mensaje.`
				},
				{ status: 400 }
			);
		}

		const attachments = [];
		for (const [index, file] of files.entries()) {
			attachments.push(
				await AgentMessageAttachmentService.createPendingAttachment({
					chatId: cid,
					activityId: ilcid,
					userId: user.id,
					file,
					sequenceOrder: index
				})
			);
		}

		return json({ attachments });
	} catch (error) {
		console.error('[agent-chat] attachment upload error:', error);
		return json(
			{
				error: error instanceof Error ? error.message : 'No se pudo procesar la imagen adjunta.'
			},
			{ status: 400 }
		);
	}
};
