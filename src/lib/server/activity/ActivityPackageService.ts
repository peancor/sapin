import {
	Uint8ArrayReader,
	Uint8ArrayWriter,
	ZipReader,
	ZipWriter,
	configure
} from '@zip.js/zip.js';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { and, eq, inArray, max } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '$lib/server/db';
import {
	agentActivityTool,
	agentToolDefinition,
	courseInteractiveLearning,
	fileStorage,
	interactiveLearning,
	interactiveLearningAgent,
	interactiveLearningChat,
	interactiveLearningFile,
	interactiveLearningRagDocument,
	type InteractiveLearningFile,
	type InteractiveLearningRagDocument,
	type InteractiveLearningStatusType
} from '$lib/server/db/schema';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { generateSlug } from '$lib/utils/slug';
import type { RagConfig } from '$lib/server/rag/config';

configure({ useWebWorkers: false });

export const ACTIVITY_PACKAGE_FORMAT_VERSION = 'sapin.activity.package@1';

const MAX_PACKAGE_BYTES = 512 * 1024 * 1024;
const MAX_PACKAGE_ENTRIES = 600;
const MAX_PACKAGE_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_PACKAGE_ENTRY_BYTES = 100 * 1024 * 1024;
const ALLOWED_TOP_LEVEL_ENTRIES = new Set(['manifest.json', 'checksums.json', 'resources', 'rag']);

export class ActivityPackageError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = 'ActivityPackageError';
		this.status = status;
	}
}

const packageActivitySchema = z.object({
	name: z.string().min(1),
	slug: z.string().optional().nullable(),
	description: z.string().optional().nullable(),
	image: z.string().optional().nullable(),
	type: z.enum(['chat', 'agent']),
	content: z.string(),
	metadata: z.string().optional().nullable(),
	sourceStatus: z.string().optional().nullable()
});

const packageChatConfigSchema = z
	.object({
		llmRole: z.string().optional().nullable(),
		llmInstructions: z.string().optional().nullable(),
		llmContext: z.string().optional().nullable(),
		systemPrompt: z.string().optional().nullable(),
		llmModel: z.string().optional().nullable(),
		temperature: z.number().optional().nullable(),
		maxTokens: z.number().int().optional().nullable(),
		topP: z.number().optional().nullable(),
		metadata: z.string().optional().nullable(),
		ragEnabled: z.boolean().optional().nullable(),
		ragCollectionName: z.string().optional().nullable(),
		ragConfig: z.unknown().optional().nullable()
	})
	.nullable()
	.optional();

const packageAgentConfigSchema = z
	.object({
		llmRole: z.string().optional().nullable(),
		llmInstructions: z.string().optional().nullable(),
		llmContext: z.string().optional().nullable(),
		systemPrompt: z.string().optional().nullable(),
		llmModel: z.string().optional().nullable(),
		temperature: z.number().optional().nullable(),
		maxTokens: z.number().int().optional().nullable(),
		topP: z.number().optional().nullable(),
		maxToolRoundtrips: z.number().int().optional().nullable(),
		parallelToolCalls: z.boolean().optional().nullable(),
		toolChoice: z.string().optional().nullable(),
		finalizationEnabled: z.boolean().optional().nullable(),
		finalizationToolName: z.string().optional().nullable(),
		finalizationHandler: z.string().optional().nullable(),
		finalizationConfig: z.string().optional().nullable(),
		requireFinalizationToolCall: z.boolean().optional().nullable(),
		ragEnabled: z.boolean().optional().nullable(),
		ragCollectionName: z.string().optional().nullable(),
		ragConfig: z.string().optional().nullable(),
		metadata: z.string().optional().nullable()
	})
	.nullable()
	.optional();

const packageAgentToolSchema = z.object({
	toolDefinitionId: z.string().min(1).nullable().optional(),
	toolName: z.string().min(1),
	configOverride: z.string().nullable().optional(),
	isEnabled: z.boolean().default(true)
});

const packageResourceSchema = z.object({
	exportedId: z.string().min(1),
	fileStorageId: z.string().nullable().optional(),
	name: z.string().min(1),
	entryPath: z.string().min(1),
	type: z.enum(['DOCUMENT', 'IMAGE']),
	size: z.number().int().nonnegative(),
	mimeType: z.string().min(1),
	hash: z.string().nullable().optional()
});

const packageRagDocumentSchema = z.object({
	exportedId: z.string().min(1),
	fileStorageId: z.string().nullable().optional(),
	name: z.string().min(1),
	entryPath: z.string().min(1),
	fileType: z.string().min(1),
	fileSize: z.number().int().nonnegative().nullable().optional(),
	mimeType: z.string().min(1),
	metadata: z.string().nullable().optional(),
	hash: z.string().nullable().optional()
});

const activityPackageManifestSchema = z.object({
	formatVersion: z.literal(ACTIVITY_PACKAGE_FORMAT_VERSION),
	exportedAt: z.string().min(1),
	sapinVersion: z.string().optional().nullable(),
	activity: packageActivitySchema,
	chatConfig: packageChatConfigSchema,
	agentConfig: packageAgentConfigSchema,
	agentTools: z.array(packageAgentToolSchema).default([]),
	resources: z.array(packageResourceSchema),
	ragDocuments: z.array(packageRagDocumentSchema).default([])
});

const checksumsSchema = z.object({
	algorithm: z.literal('sha256'),
	files: z.record(
		z.string(),
		z.object({
			sha256: z.string().regex(/^[a-f0-9]{64}$/),
			size: z.number().int().nonnegative(),
			mimeType: z.string().optional().nullable()
		})
	)
});

export type ActivityPackageManifest = z.infer<typeof activityPackageManifestSchema>;
export type ActivityPackageChecksums = z.infer<typeof checksumsSchema>;

type ZipEntryData = {
	path: string;
	bytes: Uint8Array;
};

export type ActivityPackageImportResult = {
	success: true;
	activityId: string;
	activityName: string;
	resourceCount: number;
	ragDocumentCount: number;
	revisionCount: number;
	formatVersion: string;
	type: 'chat' | 'agent';
	skippedToolCount: number;
};

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function encodeJson(value: unknown): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(value, null, 2));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function decodeJson<T>(bytes: Uint8Array, label: string): T {
	try {
		return JSON.parse(new TextDecoder().decode(bytes)) as T;
	} catch {
		throw new ActivityPackageError(400, `${label} no contiene JSON válido.`);
	}
}

function normalizeZipPath(value: string): string {
	return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function validateActivityPackageEntryPath(entryPath: string): string {
	const normalized = normalizeZipPath(entryPath);
	if (!normalized || normalized !== entryPath.replace(/\\/g, '/')) {
		throw new ActivityPackageError(400, `Ruta de paquete inválida: ${entryPath}`);
	}

	if (
		normalized.startsWith('/') ||
		normalized.includes('../') ||
		normalized.includes('/..') ||
		normalized === '..' ||
		path.win32.isAbsolute(entryPath) ||
		path.posix.isAbsolute(entryPath)
	) {
		throw new ActivityPackageError(400, `Ruta de paquete no permitida: ${entryPath}`);
	}

	const topLevel = normalized.split('/')[0];
	if (!topLevel || !ALLOWED_TOP_LEVEL_ENTRIES.has(topLevel)) {
		throw new ActivityPackageError(400, `Entrada inesperada en el paquete: ${entryPath}`);
	}

	return normalized;
}

function sanitizeResourceFilename(name: string): string {
	const fallback = 'resource.bin';
	const forbidden = '<>:"/\\|?*';
	const sanitized = Array.from(name)
		.map((char) => (char.charCodeAt(0) < 32 || forbidden.includes(char) ? '_' : char))
		.join('')
		.trim();
	return sanitized || fallback;
}

function makeResourceEntryPath(resource: InteractiveLearningFile): string {
	return `resources/${resource.id}/${sanitizeResourceFilename(resource.name)}`;
}

function makeRagEntryPath(document: InteractiveLearningRagDocument): string {
	return `rag/${document.id}/${sanitizeResourceFilename(document.name)}`;
}

export function rewriteFileUrlsInString(value: string, fileUrlIdMap: Map<string, string>): string {
	if (fileUrlIdMap.size === 0) return value;

	return value.replace(
		/(\/api\/files\/)([A-Za-z0-9_-]+)/g,
		(match, prefix: string, fileId: string) => {
			const mappedFileId = fileUrlIdMap.get(fileId);
			return mappedFileId ? `${prefix}${mappedFileId}` : match;
		}
	);
}

export function rewriteFileUrlsInUnknown(
	value: unknown,
	fileUrlIdMap: Map<string, string>
): unknown {
	if (typeof value === 'string') {
		return rewriteFileUrlsInString(value, fileUrlIdMap);
	}

	if (Array.isArray(value)) {
		return value.map((entry) => rewriteFileUrlsInUnknown(entry, fileUrlIdMap));
	}

	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				rewriteFileUrlsInUnknown(entry, fileUrlIdMap)
			])
		);
	}

	return value;
}

function rewriteNullableString(
	value: string | null | undefined,
	fileUrlIdMap: Map<string, string>
) {
	return value ? rewriteFileUrlsInString(value, fileUrlIdMap) : (value ?? null);
}

function parseMetadataForImport(input: {
	metadata?: string | null;
	importedAt: Date;
	formatVersion: string;
	sourceType: string;
}): string {
	const importMetadata = {
		importedFrom: {
			formatVersion: input.formatVersion,
			sourceType: input.sourceType,
			importedAt: input.importedAt.toISOString()
		}
	};

	if (!input.metadata) {
		return JSON.stringify(importMetadata);
	}

	try {
		const parsed = JSON.parse(input.metadata);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return JSON.stringify({ ...parsed, ...importMetadata });
		}
	} catch {
		// Preserve non-JSON metadata without trying to reinterpret it.
	}

	return JSON.stringify({
		originalMetadata: input.metadata,
		...importMetadata
	});
}

export function validateActivityPackageChecksums(
	entries: Map<string, Uint8Array>,
	checksums: ActivityPackageChecksums
): void {
	for (const [entryPath, expected] of Object.entries(checksums.files)) {
		const normalized = validateActivityPackageEntryPath(entryPath);
		const bytes = entries.get(normalized);
		if (!bytes) {
			throw new ActivityPackageError(400, `Falta la entrada ${normalized} declarada en checksums.`);
		}

		if (bytes.byteLength !== expected.size) {
			throw new ActivityPackageError(400, `Tamaño inválido para ${normalized}.`);
		}

		if (sha256(bytes) !== expected.sha256) {
			throw new ActivityPackageError(400, `Checksum inválido para ${normalized}.`);
		}
	}
}

async function readZipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
	if (bytes.byteLength > MAX_PACKAGE_BYTES) {
		throw new ActivityPackageError(
			400,
			'El paquete de actividad supera el tamaño máximo permitido.'
		);
	}

	const reader = new ZipReader(new Uint8ArrayReader(bytes));
	try {
		const zipEntries = await reader.getEntries();
		if (zipEntries.length > MAX_PACKAGE_ENTRIES) {
			throw new ActivityPackageError(400, 'El paquete contiene demasiadas entradas.');
		}

		const entries = new Map<string, Uint8Array>();
		let totalUncompressedSize = 0;

		for (const entry of zipEntries) {
			if (entry.directory) continue;
			const entryPath = validateActivityPackageEntryPath(entry.filename);
			if (entries.has(entryPath)) {
				throw new ActivityPackageError(400, `Entrada duplicada en el paquete: ${entryPath}`);
			}

			const declaredSize = entry.uncompressedSize ?? 0;
			if (declaredSize > MAX_PACKAGE_ENTRY_BYTES) {
				throw new ActivityPackageError(400, `La entrada ${entryPath} supera el tamaño permitido.`);
			}

			const data = await entry.getData?.(new Uint8ArrayWriter());
			if (!data) {
				throw new ActivityPackageError(400, `No se pudo leer ${entryPath}.`);
			}

			if (data.byteLength > MAX_PACKAGE_ENTRY_BYTES) {
				throw new ActivityPackageError(400, `La entrada ${entryPath} supera el tamaño permitido.`);
			}

			totalUncompressedSize += data.byteLength;
			if (totalUncompressedSize > MAX_PACKAGE_TOTAL_UNCOMPRESSED_BYTES) {
				throw new ActivityPackageError(400, 'El paquete descomprimido supera el tamaño permitido.');
			}

			entries.set(entryPath, data);
		}

		return entries;
	} finally {
		await reader.close();
	}
}

function requireEntry(entries: Map<string, Uint8Array>, entryPath: string): Uint8Array {
	const bytes = entries.get(entryPath);
	if (!bytes) {
		throw new ActivityPackageError(400, `Falta la entrada requerida ${entryPath}.`);
	}
	return bytes;
}

function validateManifestReferences(
	manifest: ActivityPackageManifest,
	entries: Map<string, Uint8Array>
): void {
	if (manifest.activity.type === 'chat' && !manifest.chatConfig) {
		throw new ActivityPackageError(400, 'El paquete no contiene configuración de chat.');
	}

	if (manifest.activity.type === 'agent' && !manifest.agentConfig) {
		throw new ActivityPackageError(400, 'El paquete no contiene configuración de agente.');
	}

	for (const resource of manifest.resources) {
		const entryPath = validateActivityPackageEntryPath(resource.entryPath);
		if (!entryPath.startsWith(`resources/${resource.exportedId}/`)) {
			throw new ActivityPackageError(400, `Ruta de recurso inválida para ${resource.name}.`);
		}
		if (!entries.has(entryPath)) {
			throw new ActivityPackageError(400, `Falta el recurso ${resource.name}.`);
		}
	}

	for (const document of manifest.ragDocuments) {
		const entryPath = validateActivityPackageEntryPath(document.entryPath);
		if (!entryPath.startsWith(`rag/${document.exportedId}/`)) {
			throw new ActivityPackageError(400, `Ruta de documento RAG inválida para ${document.name}.`);
		}
		if (!entries.has(entryPath)) {
			throw new ActivityPackageError(400, `Falta el documento RAG ${document.name}.`);
		}
	}
}

async function buildActivityPackageEntries(interactiveLearningId: string): Promise<{
	entries: ZipEntryData[];
	manifest: ActivityPackageManifest;
}> {
	const [activity] = await db
		.select()
		.from(interactiveLearning)
		.where(eq(interactiveLearning.id, interactiveLearningId));

	if (!activity) {
		throw new ActivityPackageError(404, 'Actividad no encontrada.');
	}

	if (activity.type !== 'chat' && activity.type !== 'agent') {
		throw new ActivityPackageError(400, 'Solo se pueden empaquetar actividades chat o agent.');
	}

	const [resources, resourceStorageRows, ragDocuments, ragStorageRows] = await Promise.all([
		db
			.select()
			.from(interactiveLearningFile)
			.where(eq(interactiveLearningFile.interactiveLearningId, interactiveLearningId))
			.all(),
		db
			.select()
			.from(fileStorage)
			.innerJoin(interactiveLearningFile, eq(fileStorage.id, interactiveLearningFile.fileStorageId))
			.where(eq(interactiveLearningFile.interactiveLearningId, interactiveLearningId))
			.all(),
		db
			.select()
			.from(interactiveLearningRagDocument)
			.where(eq(interactiveLearningRagDocument.interactiveLearningId, interactiveLearningId))
			.all(),
		db
			.select()
			.from(fileStorage)
			.innerJoin(
				interactiveLearningRagDocument,
				eq(fileStorage.id, interactiveLearningRagDocument.fileStorageId)
			)
			.where(eq(interactiveLearningRagDocument.interactiveLearningId, interactiveLearningId))
			.all()
	]);

	const resourceStorageByResourceId = new Map(
		resourceStorageRows.map((row) => [row.interactive_learning_file.id, row.file_storage])
	);
	const ragStorageByDocumentId = new Map(
		ragStorageRows.map((row) => [row.interactive_learning_rag_document.id, row.file_storage])
	);
	const entries: ZipEntryData[] = [];
	const checksumFiles: ActivityPackageChecksums['files'] = {};

	const addEntry = (entryPath: string, bytes: Uint8Array, mimeType?: string | null) => {
		const normalized = validateActivityPackageEntryPath(entryPath);
		entries.push({ path: normalized, bytes });
		checksumFiles[normalized] = {
			sha256: sha256(bytes),
			size: bytes.byteLength,
			mimeType: mimeType ?? null
		};
	};

	const resourceManifest: ActivityPackageManifest['resources'] = [];
	for (const resource of resources) {
		const storage = resourceStorageByResourceId.get(resource.id);
		if (!storage) {
			throw new ActivityPackageError(
				400,
				`El recurso ${resource.name} no tiene un archivo físico exportable.`
			);
		}

		const fileBytes = await fs.readFile(fileStorageService.getPhysicalPath(storage));
		const entryPath = makeResourceEntryPath(resource);
		addEntry(entryPath, fileBytes, resource.mimeType);
		resourceManifest.push({
			exportedId: resource.id,
			fileStorageId: resource.fileStorageId,
			name: resource.name,
			entryPath,
			type: resource.type,
			size: resource.size,
			mimeType: resource.mimeType,
			hash: storage.hash
		});
	}

	const ragDocumentManifest: ActivityPackageManifest['ragDocuments'] = [];
	for (const document of ragDocuments) {
		const storage = ragStorageByDocumentId.get(document.id);
		if (!storage) continue;

		const fileBytes = await fs.readFile(fileStorageService.getPhysicalPath(storage));
		const entryPath = makeRagEntryPath(document);
		addEntry(entryPath, fileBytes, storage.mimeType);
		ragDocumentManifest.push({
			exportedId: document.id,
			fileStorageId: document.fileStorageId,
			name: document.name,
			entryPath,
			fileType: document.fileType,
			fileSize: document.fileSize,
			mimeType: storage.mimeType,
			metadata: document.metadata,
			hash: storage.hash
		});
	}

	const [chatConfig] =
		activity.type === 'chat'
			? await db
					.select()
					.from(interactiveLearningChat)
					.where(eq(interactiveLearningChat.id, interactiveLearningId))
			: [null];
	const [agentConfig] =
		activity.type === 'agent'
			? await db
					.select()
					.from(interactiveLearningAgent)
					.where(eq(interactiveLearningAgent.id, interactiveLearningId))
			: [null];

	const agentTools =
		activity.type === 'agent'
			? await db
					.select({
						activityTool: agentActivityTool,
						toolName: agentToolDefinition.name
					})
					.from(agentActivityTool)
					.innerJoin(
						agentToolDefinition,
						eq(agentActivityTool.toolDefinitionId, agentToolDefinition.id)
					)
					.where(
						and(
							eq(agentActivityTool.agentActivityId, interactiveLearningId),
							eq(agentActivityTool.isEnabled, true)
						)
					)
					.all()
			: [];

	const manifest: ActivityPackageManifest = {
		formatVersion: ACTIVITY_PACKAGE_FORMAT_VERSION,
		exportedAt: new Date().toISOString(),
		sapinVersion: null,
		activity: {
			name: activity.name,
			slug: activity.slug,
			description: activity.description,
			image: activity.image,
			type: activity.type,
			content: activity.content,
			metadata: activity.metadata,
			sourceStatus: activity.status
		},
		chatConfig: chatConfig
			? {
					llmRole: chatConfig.llmRole,
					llmInstructions: chatConfig.llmInstructions,
					llmContext: chatConfig.llmContext,
					systemPrompt: chatConfig.systemPrompt,
					llmModel: chatConfig.llmModel,
					temperature: chatConfig.temperature,
					maxTokens: chatConfig.maxTokens,
					topP: chatConfig.topP,
					metadata: chatConfig.metadata,
					ragEnabled: chatConfig.ragEnabled,
					ragCollectionName: chatConfig.ragCollectionName,
					ragConfig: chatConfig.ragConfig
				}
			: null,
		agentConfig: agentConfig
			? {
					llmRole: agentConfig.llmRole,
					llmInstructions: agentConfig.llmInstructions,
					llmContext: agentConfig.llmContext,
					systemPrompt: agentConfig.systemPrompt,
					llmModel: agentConfig.llmModel,
					temperature: agentConfig.temperature,
					maxTokens: agentConfig.maxTokens,
					topP: agentConfig.topP,
					maxToolRoundtrips: agentConfig.maxToolRoundtrips,
					parallelToolCalls: agentConfig.parallelToolCalls,
					toolChoice: agentConfig.toolChoice,
					finalizationEnabled: agentConfig.finalizationEnabled,
					finalizationToolName: agentConfig.finalizationToolName,
					finalizationHandler: agentConfig.finalizationHandler,
					finalizationConfig: agentConfig.finalizationConfig,
					requireFinalizationToolCall: agentConfig.requireFinalizationToolCall,
					ragEnabled: agentConfig.ragEnabled,
					ragCollectionName: agentConfig.ragCollectionName,
					ragConfig: agentConfig.ragConfig,
					metadata: agentConfig.metadata
				}
			: null,
		agentTools: agentTools.map((row) => ({
			toolDefinitionId: row.activityTool.toolDefinitionId,
			toolName: row.toolName,
			configOverride: row.activityTool.configOverride,
			isEnabled: row.activityTool.isEnabled
		})),
		resources: resourceManifest,
		ragDocuments: ragDocumentManifest
	};

	addEntry('manifest.json', encodeJson(manifest), 'application/json');
	addEntry(
		'checksums.json',
		encodeJson({ algorithm: 'sha256', files: checksumFiles }),
		'application/json'
	);

	return { entries, manifest };
}

async function resolveAgentToolId(
	tool: ActivityPackageManifest['agentTools'][number]
): Promise<string | null> {
	if (tool.toolDefinitionId) {
		const [byId] = await db
			.select({ id: agentToolDefinition.id })
			.from(agentToolDefinition)
			.where(eq(agentToolDefinition.id, tool.toolDefinitionId))
			.limit(1);
		if (byId) return byId.id;
	}

	const [byName] = await db
		.select({ id: agentToolDefinition.id })
		.from(agentToolDefinition)
		.where(eq(agentToolDefinition.name, tool.toolName))
		.limit(1);
	return byName?.id ?? null;
}

export class ActivityPackageService {
	static async exportActivityPackage(interactiveLearningId: string): Promise<{
		bytes: Uint8Array;
		filename: string;
		manifest: ActivityPackageManifest;
	}> {
		const { entries, manifest } = await buildActivityPackageEntries(interactiveLearningId);
		const zipWriter = new ZipWriter(new Uint8ArrayWriter());

		for (const entry of entries) {
			await zipWriter.add(entry.path, new Uint8ArrayReader(entry.bytes));
		}

		const bytes = await zipWriter.close();
		const filenameBase =
			manifest.activity.slug || manifest.activity.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
		return {
			bytes,
			filename: `activity-${filenameBase || 'package'}-${Date.now()}.sapinactivity.zip`,
			manifest
		};
	}

	static async inspectPackage(file: File): Promise<{
		manifest: ActivityPackageManifest;
		entries: Map<string, Uint8Array>;
	}> {
		const bytes = new Uint8Array(await file.arrayBuffer());
		const entries = await readZipEntries(bytes);
		const manifest = activityPackageManifestSchema.parse(
			decodeJson(requireEntry(entries, 'manifest.json'), 'manifest.json')
		);
		const checksums = checksumsSchema.parse(
			decodeJson(requireEntry(entries, 'checksums.json'), 'checksums.json')
		);

		validateManifestReferences(manifest, entries);
		validateActivityPackageChecksums(entries, checksums);

		return { manifest, entries };
	}

	static async importActivityPackage(input: {
		courseId: string;
		userId: string;
		file: File;
	}): Promise<ActivityPackageImportResult> {
		const { manifest, entries } = await this.inspectPackage(input.file);
		const now = new Date();
		const activityId = nanoid();
		const existingSlugs = await db
			.select({ slug: interactiveLearning.slug })
			.from(interactiveLearning)
			.then((rows) => rows.map((row) => row.slug));
		const slugBase = manifest.activity.slug || generateSlug(manifest.activity.name, 60);
		let slug = slugBase;
		let counter = 1;
		while (existingSlugs.includes(slug)) {
			slug = `${generateSlug(manifest.activity.name, 50)}-${counter}`;
			counter++;
		}

		const fileUrlIdMap = new Map<string, string>();
		const importedResources: Array<{
			exportedId: string;
			record: Omit<InteractiveLearningFile, 'createdAt'> & { createdAt: Date };
		}> = [];
		const importedRagDocuments: Array<{
			exportedId: string;
			record: Omit<InteractiveLearningRagDocument, 'createdAt' | 'updatedAt'> & {
				createdAt: Date;
				updatedAt: Date;
			};
		}> = [];
		const uploadedStorageIds: string[] = [];
		let skippedToolCount = 0;

		try {
			for (const resource of manifest.resources) {
				const bytes = requireEntry(entries, resource.entryPath);
				const blob = new Blob([toArrayBuffer(bytes)], { type: resource.mimeType });
				const importedFile = new File([blob], resource.name, {
					type: resource.mimeType,
					lastModified: now.getTime()
				});
				const upload = await fileStorageService.upload({
					file: importedFile,
					category: 'chat',
					entityType: 'interactive_learning',
					entityId: activityId,
					uploadedBy: input.userId,
					displayName: resource.name,
					visibility: 'restricted'
				});

				if (!upload.success || !upload.fileId) {
					throw new ActivityPackageError(
						400,
						upload.error || `No se pudo importar ${resource.name}.`
					);
				}

				uploadedStorageIds.push(upload.fileId);
				const newInteractiveFileId = nanoid();
				fileUrlIdMap.set(resource.exportedId, upload.fileId);
				if (resource.fileStorageId) {
					fileUrlIdMap.set(resource.fileStorageId, upload.fileId);
				}
				importedResources.push({
					exportedId: resource.exportedId,
					record: {
						id: newInteractiveFileId,
						interactiveLearningId: activityId,
						fileStorageId: upload.fileId,
						name: resource.name,
						path: `/api/files/${upload.fileId}`,
						type: resource.type,
						size: bytes.byteLength,
						mimeType: resource.mimeType,
						createdAt: now
					}
				});
			}

			for (const document of manifest.ragDocuments) {
				const bytes = requireEntry(entries, document.entryPath);
				const blob = new Blob([toArrayBuffer(bytes)], { type: document.mimeType });
				const importedFile = new File([blob], document.name, {
					type: document.mimeType,
					lastModified: now.getTime()
				});
				const upload = await fileStorageService.upload({
					file: importedFile,
					category: 'rag_document',
					entityType: 'interactive_learning',
					entityId: activityId,
					uploadedBy: input.userId,
					displayName: document.name,
					visibility: 'private'
				});

				if (!upload.success || !upload.fileId) {
					throw new ActivityPackageError(
						400,
						upload.error || `No se pudo importar el documento RAG ${document.name}.`
					);
				}

				uploadedStorageIds.push(upload.fileId);
				const newDocumentId = nanoid();
				fileUrlIdMap.set(document.exportedId, upload.fileId);
				if (document.fileStorageId) {
					fileUrlIdMap.set(document.fileStorageId, upload.fileId);
				}
				importedRagDocuments.push({
					exportedId: document.exportedId,
					record: {
						id: newDocumentId,
						interactiveLearningId: activityId,
						fileStorageId: upload.fileId,
						name: document.name,
						originalPath: `/api/files/${upload.fileId}`,
						fileType: document.fileType,
						fileSize: bytes.byteLength,
						chunkCount: 0,
						totalCharacters: 0,
						status: 'pending',
						errorMessage: null,
						qdrantPointIds: null,
						metadata: document.metadata ?? null,
						createdAt: now,
						updatedAt: now
					}
				});
			}

			const rewrittenActivity = {
				name: manifest.activity.name,
				slug,
				description: rewriteNullableString(manifest.activity.description, fileUrlIdMap),
				image: rewriteNullableString(manifest.activity.image, fileUrlIdMap),
				type: manifest.activity.type,
				content: rewriteFileUrlsInString(manifest.activity.content, fileUrlIdMap),
				metadata: parseMetadataForImport({
					metadata: rewriteNullableString(manifest.activity.metadata, fileUrlIdMap),
					importedAt: now,
					formatVersion: manifest.formatVersion,
					sourceType: manifest.activity.type
				})
			};
			const rewrittenChatConfig = manifest.chatConfig
				? (rewriteFileUrlsInUnknown(manifest.chatConfig, fileUrlIdMap) as NonNullable<
						ActivityPackageManifest['chatConfig']
					>)
				: null;
			const rewrittenAgentConfig = manifest.agentConfig
				? (rewriteFileUrlsInUnknown(manifest.agentConfig, fileUrlIdMap) as NonNullable<
						ActivityPackageManifest['agentConfig']
					>)
				: null;
			const resolvedAgentTools: Array<{
				toolDefinitionId: string;
				configOverride?: string | null;
				isEnabled: boolean;
			}> = [];

			if (manifest.activity.type === 'agent') {
				for (const tool of manifest.agentTools) {
					const toolDefinitionId = await resolveAgentToolId(tool);
					if (!toolDefinitionId) {
						skippedToolCount += 1;
						continue;
					}
					resolvedAgentTools.push({
						toolDefinitionId,
						configOverride: rewriteNullableString(tool.configOverride, fileUrlIdMap),
						isEnabled: tool.isEnabled
					});
				}
			}

			db.transaction((tx) => {
				tx.insert(interactiveLearning)
					.values({
						id: activityId,
						name: rewrittenActivity.name,
						slug: rewrittenActivity.slug,
						description: rewrittenActivity.description,
						image: rewrittenActivity.image,
						type: rewrittenActivity.type,
						content: rewrittenActivity.content,
						status: 'hidden' satisfies InteractiveLearningStatusType,
						publishedAt: null,
						closedAt: null,
						archivedAt: null,
						metadata: rewrittenActivity.metadata,
						createdAt: now,
						updatedAt: now
					})
					.run();

				if (manifest.activity.type === 'chat' && rewrittenChatConfig) {
					tx.insert(interactiveLearningChat)
						.values({
							id: activityId,
							llmRole: rewrittenChatConfig.llmRole ?? null,
							llmInstructions: rewrittenChatConfig.llmInstructions ?? null,
							llmContext: rewrittenChatConfig.llmContext ?? null,
							systemPrompt: rewrittenChatConfig.systemPrompt ?? null,
							llmModel: rewrittenChatConfig.llmModel ?? null,
							temperature: rewrittenChatConfig.temperature ?? null,
							maxTokens: rewrittenChatConfig.maxTokens ?? null,
							topP: rewrittenChatConfig.topP ?? null,
							metadata: rewrittenChatConfig.metadata ?? null,
							ragEnabled: false,
							ragCollectionName: null,
							ragConfig: (rewrittenChatConfig.ragConfig ?? null) as RagConfig | null,
							createdAt: now
						})
						.run();
				}

				if (manifest.activity.type === 'agent' && rewrittenAgentConfig) {
					tx.insert(interactiveLearningAgent)
						.values({
							id: activityId,
							llmRole: rewrittenAgentConfig.llmRole ?? null,
							llmInstructions: rewrittenAgentConfig.llmInstructions ?? null,
							llmContext: rewrittenAgentConfig.llmContext ?? null,
							systemPrompt: rewrittenAgentConfig.systemPrompt ?? null,
							llmModel: rewrittenAgentConfig.llmModel ?? null,
							temperature: rewrittenAgentConfig.temperature ?? null,
							maxTokens: rewrittenAgentConfig.maxTokens ?? null,
							topP: rewrittenAgentConfig.topP ?? null,
							maxToolRoundtrips: rewrittenAgentConfig.maxToolRoundtrips ?? 5,
							parallelToolCalls: rewrittenAgentConfig.parallelToolCalls ?? false,
							toolChoice: rewrittenAgentConfig.toolChoice ?? 'auto',
							finalizationEnabled: rewrittenAgentConfig.finalizationEnabled ?? true,
							finalizationToolName:
								rewrittenAgentConfig.finalizationToolName ?? 'finalize_activity',
							finalizationHandler:
								rewrittenAgentConfig.finalizationHandler ?? 'mark_complete_and_notify',
							finalizationConfig: rewrittenAgentConfig.finalizationConfig ?? null,
							requireFinalizationToolCall: rewrittenAgentConfig.requireFinalizationToolCall ?? true,
							ragEnabled: false,
							ragCollectionName: null,
							ragConfig: rewrittenAgentConfig.ragConfig ?? null,
							metadata: rewrittenAgentConfig.metadata ?? null,
							createdAt: now
						})
						.run();

					if (resolvedAgentTools.length > 0) {
						tx.insert(agentActivityTool)
							.values(
								resolvedAgentTools.map((tool) => ({
									id: nanoid(),
									agentActivityId: activityId,
									toolDefinitionId: tool.toolDefinitionId,
									configOverride: tool.configOverride ?? null,
									isEnabled: tool.isEnabled,
									createdAt: now
								}))
							)
							.run();
					}
				}

				if (importedResources.length > 0) {
					tx.insert(interactiveLearningFile)
						.values(importedResources.map((resource) => resource.record))
						.run();
				}

				if (importedRagDocuments.length > 0) {
					tx.insert(interactiveLearningRagDocument)
						.values(importedRagDocuments.map((document) => document.record))
						.run();
				}

				const maxOrderResult = tx
					.select({ maxOrder: max(courseInteractiveLearning.order) })
					.from(courseInteractiveLearning)
					.where(eq(courseInteractiveLearning.courseId, input.courseId))
					.get();
				const nextOrder = (maxOrderResult?.maxOrder ?? 0) + 1;

				tx.insert(courseInteractiveLearning)
					.values({
						id: nanoid(),
						courseId: input.courseId,
						interactiveLearningId: activityId,
						order: nextOrder,
						createdAt: now
					})
					.run();
			});
		} catch (error) {
			if (uploadedStorageIds.length > 0) {
				await db
					.update(fileStorage)
					.set({
						isOrphan: true,
						markedForDeletionAt: new Date()
					})
					.where(
						and(inArray(fileStorage.id, uploadedStorageIds), eq(fileStorage.entityId, activityId))
					);
			}
			throw error;
		}

		return {
			success: true,
			activityId,
			activityName: manifest.activity.name,
			resourceCount: importedResources.length,
			ragDocumentCount: importedRagDocuments.length,
			revisionCount: 0,
			formatVersion: manifest.formatVersion,
			type: manifest.activity.type,
			skippedToolCount
		};
	}
}
