import fs from 'fs/promises';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import type { AgentMessageAttachment } from '$lib/server/db/schema';
import {
	MAX_AGENT_IMAGE_ATTACHMENTS_PER_MESSAGE,
	SANITIZED_AGENT_IMAGE_MIME_TYPE,
	sanitizeAgentImage
} from './AgentImageSanitizer';

export interface DisplayAttachment {
	id: string;
	kind: 'image';
	fileId: string;
	url: string;
	thumbnailUrl: string;
	displayName: string | null;
	width: number | null;
	height: number | null;
	size: number;
	mimeType: string;
}

export interface ModelImageAttachment {
	id: string;
	image: Uint8Array;
	mediaType: string;
}

export class AgentMessageAttachmentService {
	static readonly maxAttachmentsPerMessage = MAX_AGENT_IMAGE_ATTACHMENTS_PER_MESSAGE;

	static parseAttachmentIds(raw: string | null | undefined): string[] {
		if (!raw) return [];
		const ids = raw
			.split(',')
			.map((id) => id.trim())
			.filter(Boolean);

		return [...new Set(ids)].slice(0, MAX_AGENT_IMAGE_ATTACHMENTS_PER_MESSAGE + 1);
	}

	static async createPendingAttachment(params: {
		chatId: string;
		activityId: string;
		userId: string;
		file: File;
		sequenceOrder: number;
	}): Promise<DisplayAttachment> {
		const sanitized = await sanitizeAgentImage(params.file);
		const uploadResult = await fileStorageService.upload({
			file: sanitized.file,
			category: 'chat',
			entityType: 'interactive_learning_chat',
			entityId: params.activityId,
			uploadedBy: params.userId,
			displayName: sanitized.originalName,
			visibility: 'restricted'
		});

		if (!uploadResult.success || !uploadResult.fileId || !uploadResult.file) {
			throw new Error(uploadResult.error ?? 'No se pudo guardar la imagen.');
		}

		const now = new Date();
		const [attachment] = await db
			.insert(schema.agentMessageAttachment)
			.values({
				id: nanoid(),
				chatId: params.chatId,
				messageId: null,
				fileStorageId: uploadResult.fileId,
				kind: 'image',
				status: 'pending',
				safetyStatus: 'not_checked',
				sequenceOrder: params.sequenceOrder,
				width: sanitized.width,
				height: sanitized.height,
				size: sanitized.size,
				mimeType: SANITIZED_AGENT_IMAGE_MIME_TYPE,
				uploadedBy: params.userId,
				metadata: JSON.stringify({
					originalName: sanitized.originalName,
					originalMimeType: sanitized.originalMimeType,
					originalSize: sanitized.originalSize,
					sanitized: true
				}),
				createdAt: now,
				updatedAt: now
			})
			.returning();

		return this.toDisplayAttachment(attachment, uploadResult.file);
	}

	static async validatePendingAttachments(params: {
		attachmentIds: string[];
		chatId: string;
		userId: string;
	}): Promise<AgentMessageAttachment[]> {
		if (params.attachmentIds.length === 0) return [];

		if (params.attachmentIds.length > MAX_AGENT_IMAGE_ATTACHMENTS_PER_MESSAGE) {
			throw new Error(
				`Puedes adjuntar como máximo ${MAX_AGENT_IMAGE_ATTACHMENTS_PER_MESSAGE} imágenes por mensaje.`
			);
		}

		const rows = await db
			.select()
			.from(schema.agentMessageAttachment)
			.where(inArray(schema.agentMessageAttachment.id, params.attachmentIds));

		const byId = new Map(rows.map((row) => [row.id, row]));
		const orderedRows = params.attachmentIds.map((id) => byId.get(id));

		if (orderedRows.some((row) => !row)) {
			throw new Error('Alguna imagen adjunta no existe o ya no está disponible.');
		}

		const invalid = orderedRows.find(
			(row) =>
				!row ||
				row.chatId !== params.chatId ||
				row.uploadedBy !== params.userId ||
				row.status !== 'pending' ||
				row.messageId !== null
		);

		if (invalid) {
			throw new Error('Alguna imagen adjunta no pertenece a este chat o ya fue enviada.');
		}

		return orderedRows as AgentMessageAttachment[];
	}

	static async attachToMessage(params: {
		attachmentIds: string[];
		chatId: string;
		messageId: string;
		userId: string;
	}): Promise<AgentMessageAttachment[]> {
		const attachments = await this.validatePendingAttachments({
			attachmentIds: params.attachmentIds,
			chatId: params.chatId,
			userId: params.userId
		});

		if (attachments.length === 0) return [];

		const now = new Date();
		for (const [index, attachmentId] of params.attachmentIds.entries()) {
			await db
				.update(schema.agentMessageAttachment)
				.set({
					messageId: params.messageId,
					status: 'attached',
					sequenceOrder: index,
					updatedAt: now
				})
				.where(eq(schema.agentMessageAttachment.id, attachmentId));
		}

		return attachments.map((attachment, index) => ({
			...attachment,
			messageId: params.messageId,
			status: 'attached',
			sequenceOrder: index
		}));
	}

	static async getModelImageAttachments(messageId: string): Promise<ModelImageAttachment[]> {
		const rows = await db
			.select({
				attachment: schema.agentMessageAttachment,
				file: schema.fileStorage
			})
			.from(schema.agentMessageAttachment)
			.innerJoin(
				schema.fileStorage,
				eq(schema.agentMessageAttachment.fileStorageId, schema.fileStorage.id)
			)
			.where(
				and(
					eq(schema.agentMessageAttachment.messageId, messageId),
					eq(schema.agentMessageAttachment.status, 'attached'),
					eq(schema.agentMessageAttachment.kind, 'image')
				)
			)
			.orderBy(asc(schema.agentMessageAttachment.sequenceOrder));

		const result: ModelImageAttachment[] = [];
		for (const row of rows) {
			const filePath = fileStorageService.getPhysicalPath(row.file);
			const bytes = await fs.readFile(filePath);
			result.push({
				id: row.attachment.id,
				image: new Uint8Array(bytes),
				mediaType: row.attachment.mimeType
			});
		}
		return result;
	}

	static async getDisplayAttachmentsByMessageIds(
		messageIds: string[]
	): Promise<Map<string, DisplayAttachment[]>> {
		const result = new Map<string, DisplayAttachment[]>();
		if (messageIds.length === 0) return result;

		const rows = await db
			.select({
				attachment: schema.agentMessageAttachment,
				file: schema.fileStorage
			})
			.from(schema.agentMessageAttachment)
			.innerJoin(
				schema.fileStorage,
				eq(schema.agentMessageAttachment.fileStorageId, schema.fileStorage.id)
			)
			.where(
				and(
					inArray(schema.agentMessageAttachment.messageId, messageIds),
					eq(schema.agentMessageAttachment.status, 'attached')
				)
			)
			.orderBy(asc(schema.agentMessageAttachment.sequenceOrder));

		for (const row of rows) {
			if (!row.attachment.messageId) continue;
			const bucket = result.get(row.attachment.messageId) ?? [];
			bucket.push(this.toDisplayAttachment(row.attachment, row.file));
			result.set(row.attachment.messageId, bucket);
		}

		return result;
	}

	static getAttachmentStats(attachments: AgentMessageAttachment[]) {
		return {
			imageAttachmentCount: attachments.length,
			imageAttachmentBytes: attachments.reduce((total, attachment) => total + attachment.size, 0)
		};
	}

	private static toDisplayAttachment(
		attachment: AgentMessageAttachment,
		file: typeof schema.fileStorage.$inferSelect
	): DisplayAttachment {
		return {
			id: attachment.id,
			kind: 'image',
			fileId: attachment.fileStorageId,
			url: `/api/files/${attachment.fileStorageId}`,
			thumbnailUrl: `/api/files/${attachment.fileStorageId}/thumbnail`,
			displayName: file.displayName ?? file.name ?? null,
			width: attachment.width,
			height: attachment.height,
			size: attachment.size,
			mimeType: attachment.mimeType
		};
	}
}
