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
	courseInteractiveLearning,
	fileStorage,
	interactiveLearning,
	interactiveLearningFile,
	interactiveLearningLesson,
	interactiveLearningLessonRevision,
	type InteractiveLearningFile
} from '$lib/server/db/schema';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { generateSlug } from '$lib/utils/slug';
import type { LessonDefinition } from '$lib/types/lesson';
import { LessonRevisionService } from './LessonRevisionService';
import { LessonServiceError } from './LessonServiceError';

configure({ useWebWorkers: false });

export const LESSON_PACKAGE_FORMAT_VERSION = 'sapin.lesson.package@1';
const MAX_PACKAGE_BYTES = 512 * 1024 * 1024;
const MAX_PACKAGE_ENTRIES = 600;
const MAX_PACKAGE_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_PACKAGE_ENTRY_BYTES = 100 * 1024 * 1024;
const ALLOWED_TOP_LEVEL_ENTRIES = new Set([
	'manifest.json',
	'checksums.json',
	'lesson',
	'resources'
]);

const packageActivitySchema = z.object({
	name: z.string().min(1),
	slug: z.string().optional().nullable(),
	description: z.string().optional().nullable(),
	image: z.string().optional().nullable(),
	type: z.literal('lesson'),
	metadata: z.string().optional().nullable(),
	sourceStatus: z.string().optional().nullable()
});

const packageLessonConfigSchema = z.object({
	sessionPolicy: z.enum(['resume_latest', 'always_new_attempt']).default('resume_latest'),
	allowRestart: z.boolean().default(true),
	metadata: z.string().optional().nullable()
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

const lessonPackageManifestSchema = z.object({
	formatVersion: z.literal(LESSON_PACKAGE_FORMAT_VERSION),
	exportedAt: z.string().min(1),
	sapinVersion: z.string().optional().nullable(),
	activity: packageActivitySchema,
	lessonConfig: packageLessonConfigSchema,
	current: z.object({
		publishedDefinitionPath: z.string().min(1).nullable().optional(),
		draftDefinitionPath: z.string().min(1)
	}),
	resources: z.array(packageResourceSchema)
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

export type LessonPackageManifest = z.infer<typeof lessonPackageManifestSchema>;
export type LessonPackageChecksums = z.infer<typeof checksumsSchema>;

type ZipEntryData = {
	path: string;
	bytes: Uint8Array;
};

export type LessonPackageImportResult = {
	success: true;
	activityId: string;
	activityName: string;
	resourceCount: number;
	revisionCount: number;
	formatVersion: string;
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
		throw new LessonServiceError(400, `${label} no contiene JSON válido.`);
	}
}

function normalizeZipPath(value: string): string {
	return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function validateLessonPackageEntryPath(entryPath: string): string {
	const normalized = normalizeZipPath(entryPath);
	if (!normalized || normalized !== entryPath.replace(/\\/g, '/')) {
		throw new LessonServiceError(400, `Ruta de paquete inválida: ${entryPath}`);
	}

	if (
		normalized.startsWith('/') ||
		normalized.includes('../') ||
		normalized.includes('/..') ||
		normalized === '..' ||
		path.win32.isAbsolute(entryPath) ||
		path.posix.isAbsolute(entryPath)
	) {
		throw new LessonServiceError(400, `Ruta de paquete no permitida: ${entryPath}`);
	}

	const topLevel = normalized.split('/')[0];
	if (!topLevel || !ALLOWED_TOP_LEVEL_ENTRIES.has(topLevel)) {
		throw new LessonServiceError(400, `Entrada inesperada en el paquete: ${entryPath}`);
	}

	if (
		topLevel === 'lesson' &&
		normalized !== 'lesson/definition.published.json' &&
		normalized !== 'lesson/definition.draft.json'
	) {
		throw new LessonServiceError(400, `Entrada inesperada en la lección: ${entryPath}`);
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

function parseMetadataForImport(input: {
	metadata?: string | null;
	sourceActivityId?: string | null;
	importedAt: Date;
	formatVersion: string;
}): string {
	const importMetadata = {
		importedFrom: {
			sourceActivityId: input.sourceActivityId ?? null,
			formatVersion: input.formatVersion,
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

export function rewriteLessonDefinitionResourceIds(
	definition: LessonDefinition,
	resourceIdMap: Map<string, string>
): LessonDefinition {
	return {
		...definition,
		blocks: definition.blocks.map((block) => {
			if (block.kind !== 'content' || !block.assetRefs?.length) {
				return block;
			}

			return {
				...block,
				assetRefs: block.assetRefs.map((asset) => ({
					...asset,
					fileId: resourceIdMap.get(asset.fileId) ?? asset.fileId
				}))
			};
		})
	};
}

export function assertAllLessonAssetRefsResolvable(
	definitions: LessonDefinition[],
	knownResourceIds: Set<string>
): void {
	for (const definition of definitions) {
		for (const block of definition.blocks) {
			if (block.kind !== 'content') continue;
			for (const asset of block.assetRefs ?? []) {
				if (!knownResourceIds.has(asset.fileId)) {
					throw new LessonServiceError(
						400,
						`El recurso ${asset.fileId} referenciado por la lesson no está incluido en el paquete.`
					);
				}
			}
		}
	}
}

export function validateLessonPackageChecksums(
	entries: Map<string, Uint8Array>,
	checksums: LessonPackageChecksums
): void {
	for (const [entryPath, expected] of Object.entries(checksums.files)) {
		const normalized = validateLessonPackageEntryPath(entryPath);
		const bytes = entries.get(normalized);
		if (!bytes) {
			throw new LessonServiceError(400, `Falta la entrada ${normalized} declarada en checksums.`);
		}

		if (bytes.byteLength !== expected.size) {
			throw new LessonServiceError(400, `Tamaño inválido para ${normalized}.`);
		}

		if (sha256(bytes) !== expected.sha256) {
			throw new LessonServiceError(400, `Checksum inválido para ${normalized}.`);
		}
	}
}

async function readZipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
	if (bytes.byteLength > MAX_PACKAGE_BYTES) {
		throw new LessonServiceError(400, 'El paquete de lesson supera el tamaño máximo permitido.');
	}

	const reader = new ZipReader(new Uint8ArrayReader(bytes));
	try {
		const zipEntries = await reader.getEntries();
		if (zipEntries.length > MAX_PACKAGE_ENTRIES) {
			throw new LessonServiceError(400, 'El paquete contiene demasiadas entradas.');
		}

		const entries = new Map<string, Uint8Array>();
		let totalUncompressedSize = 0;

		for (const entry of zipEntries) {
			if (entry.directory) continue;
			const entryPath = validateLessonPackageEntryPath(entry.filename);
			if (entries.has(entryPath)) {
				throw new LessonServiceError(400, `Entrada duplicada en el paquete: ${entryPath}`);
			}

			const declaredSize = entry.uncompressedSize ?? 0;
			if (declaredSize > MAX_PACKAGE_ENTRY_BYTES) {
				throw new LessonServiceError(400, `La entrada ${entryPath} supera el tamaño permitido.`);
			}

			const data = await entry.getData?.(new Uint8ArrayWriter());
			if (!data) {
				throw new LessonServiceError(400, `No se pudo leer ${entryPath}.`);
			}

			if (data.byteLength > MAX_PACKAGE_ENTRY_BYTES) {
				throw new LessonServiceError(400, `La entrada ${entryPath} supera el tamaño permitido.`);
			}

			totalUncompressedSize += data.byteLength;
			if (totalUncompressedSize > MAX_PACKAGE_TOTAL_UNCOMPRESSED_BYTES) {
				throw new LessonServiceError(400, 'El paquete descomprimido supera el tamaño permitido.');
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
		throw new LessonServiceError(400, `Falta la entrada requerida ${entryPath}.`);
	}
	return bytes;
}

function validateManifestReferences(
	manifest: LessonPackageManifest,
	entries: Map<string, Uint8Array>
): void {
	const draftDefinitionPath = validateLessonPackageEntryPath(manifest.current.draftDefinitionPath);
	if (!entries.has(draftDefinitionPath)) {
		throw new LessonServiceError(400, `Falta la definición ${draftDefinitionPath}.`);
	}

	if (manifest.current.publishedDefinitionPath) {
		const publishedDefinitionPath = validateLessonPackageEntryPath(
			manifest.current.publishedDefinitionPath
		);
		if (!entries.has(publishedDefinitionPath)) {
			throw new LessonServiceError(400, `Falta la definición ${publishedDefinitionPath}.`);
		}
	}

	for (const resource of manifest.resources) {
		const entryPath = validateLessonPackageEntryPath(resource.entryPath);
		if (!entryPath.startsWith(`resources/${resource.exportedId}/`)) {
			throw new LessonServiceError(400, `Ruta de recurso inválida para ${resource.name}.`);
		}
		if (!entries.has(entryPath)) {
			throw new LessonServiceError(400, `Falta el recurso ${resource.name}.`);
		}
	}
}

function parsePackagedDefinition(
	entries: Map<string, Uint8Array>,
	definitionPath: string
): LessonDefinition {
	return LessonRevisionService.parseDefinition(
		new TextDecoder().decode(requireEntry(entries, definitionPath))
	);
}

function getPackagedLessonDefinitions(
	manifest: LessonPackageManifest,
	entries: Map<string, Uint8Array>
): {
	publishedDefinition: LessonDefinition | null;
	draftDefinition: LessonDefinition;
	allDefinitions: LessonDefinition[];
} {
	const draftDefinition = parsePackagedDefinition(entries, manifest.current.draftDefinitionPath);
	const publishedDefinition = manifest.current.publishedDefinitionPath
		? parsePackagedDefinition(entries, manifest.current.publishedDefinitionPath)
		: null;

	return {
		publishedDefinition,
		draftDefinition,
		allDefinitions: publishedDefinition ? [publishedDefinition, draftDefinition] : [draftDefinition]
	};
}

async function buildLessonPackageEntries(interactiveLearningId: string): Promise<{
	entries: ZipEntryData[];
	manifest: LessonPackageManifest;
}> {
	const state = await LessonRevisionService.ensureLessonRevisionState(interactiveLearningId);
	const [resources, storageFiles] = await Promise.all([
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
			.all()
	]);

	const storageByFileId = new Map(
		storageFiles.map((row) => [row.interactive_learning_file.id, row.file_storage])
	);
	const entries: ZipEntryData[] = [];
	const checksumFiles: LessonPackageChecksums['files'] = {};

	const addEntry = (entryPath: string, bytes: Uint8Array, mimeType?: string | null) => {
		const normalized = validateLessonPackageEntryPath(entryPath);
		entries.push({ path: normalized, bytes });
		checksumFiles[normalized] = {
			sha256: sha256(bytes),
			size: bytes.byteLength,
			mimeType: mimeType ?? null
		};
	};

	addEntry(
		'lesson/definition.published.json',
		encodeJson(state.publishedDefinition),
		'application/json'
	);
	addEntry('lesson/definition.draft.json', encodeJson(state.draftDefinition), 'application/json');

	const resourceManifest: LessonPackageManifest['resources'] = [];
	for (const resource of resources) {
		const storage = storageByFileId.get(resource.id);
		if (!storage) {
			throw new LessonServiceError(
				400,
				`El recurso ${resource.name} no tiene un archivo físico exportable.`
			);
		}

		const physicalPath = fileStorageService.getPhysicalPath(storage);
		const fileBytes = await fs.readFile(physicalPath);
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

	const manifest: LessonPackageManifest = {
		formatVersion: LESSON_PACKAGE_FORMAT_VERSION,
		exportedAt: new Date().toISOString(),
		sapinVersion: null,
		activity: {
			name: state.activity.name,
			slug: state.activity.slug,
			description: state.activity.description,
			image: state.activity.image,
			type: 'lesson',
			metadata: state.activity.metadata,
			sourceStatus: state.activity.status
		},
		lessonConfig: {
			sessionPolicy: state.lesson.sessionPolicy,
			allowRestart: state.lesson.allowRestart,
			metadata: state.lesson.metadata
		},
		current: {
			publishedDefinitionPath: 'lesson/definition.published.json',
			draftDefinitionPath: 'lesson/definition.draft.json'
		},
		resources: resourceManifest
	};

	addEntry('manifest.json', encodeJson(manifest), 'application/json');
	addEntry(
		'checksums.json',
		encodeJson({ algorithm: 'sha256', files: checksumFiles }),
		'application/json'
	);

	return { entries, manifest };
}

export class LessonPackageService {
	static async exportLessonPackage(interactiveLearningId: string): Promise<{
		bytes: Uint8Array;
		filename: string;
		manifest: LessonPackageManifest;
	}> {
		const { entries, manifest } = await buildLessonPackageEntries(interactiveLearningId);
		const zipWriter = new ZipWriter(new Uint8ArrayWriter());

		for (const entry of entries) {
			await zipWriter.add(entry.path, new Uint8ArrayReader(entry.bytes));
		}

		const bytes = await zipWriter.close();
		const filenameBase = manifest.activity.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
		return {
			bytes,
			filename: `lesson-${filenameBase || 'package'}-${Date.now()}.sapinlesson.zip`,
			manifest
		};
	}

	static async inspectPackage(file: File): Promise<{
		manifest: LessonPackageManifest;
		entries: Map<string, Uint8Array>;
	}> {
		const bytes = new Uint8Array(await file.arrayBuffer());
		const entries = await readZipEntries(bytes);
		const manifest = lessonPackageManifestSchema.parse(
			decodeJson(requireEntry(entries, 'manifest.json'), 'manifest.json')
		);
		const checksums = checksumsSchema.parse(
			decodeJson(requireEntry(entries, 'checksums.json'), 'checksums.json')
		);

		validateManifestReferences(manifest, entries);
		validateLessonPackageChecksums(entries, checksums);

		const definitions = getPackagedLessonDefinitions(manifest, entries);
		assertAllLessonAssetRefsResolvable(
			definitions.allDefinitions,
			new Set(manifest.resources.map((resource) => resource.exportedId))
		);

		return { manifest, entries };
	}

	static async importLessonPackage(input: {
		courseId: string;
		userId: string;
		file: File;
	}): Promise<LessonPackageImportResult> {
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

		const resourceIdMap = new Map<string, string>();
		const importedResources: Array<{
			exportedId: string;
			record: Omit<InteractiveLearningFile, 'createdAt'> & { createdAt: Date };
		}> = [];
		let importedRevisionCount = 0;

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
					throw new LessonServiceError(
						400,
						upload.error || `No se pudo importar ${resource.name}.`
					);
				}

				const newInteractiveFileId = nanoid();
				resourceIdMap.set(resource.exportedId, newInteractiveFileId);
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

			const packagedDefinitions = getPackagedLessonDefinitions(manifest, entries);
			const rewrittenPublished = packagedDefinitions.publishedDefinition
				? rewriteLessonDefinitionResourceIds(packagedDefinitions.publishedDefinition, resourceIdMap)
				: null;
			const rewrittenDraft = rewriteLessonDefinitionResourceIds(
				packagedDefinitions.draftDefinition,
				resourceIdMap
			);
			const publishedRevisionId = rewrittenPublished ? nanoid() : null;
			const draftRevisionId = nanoid();
			importedRevisionCount = rewrittenPublished ? 2 : 1;

			db.transaction((tx) => {
				tx.insert(interactiveLearning)
					.values({
						id: activityId,
						name: manifest.activity.name,
						slug,
						description: manifest.activity.description ?? null,
						image: manifest.activity.image ?? null,
						type: 'lesson',
						content: LessonRevisionService.serializeDefinition(
							rewrittenPublished ?? rewrittenDraft
						),
						status: 'hidden',
						publishedAt: null,
						closedAt: null,
						archivedAt: null,
						metadata: parseMetadataForImport({
							metadata: manifest.activity.metadata,
							sourceActivityId: null,
							importedAt: now,
							formatVersion: manifest.formatVersion
						}),
						createdAt: now,
						updatedAt: now
					})
					.run();

				tx.insert(interactiveLearningLesson)
					.values({
						id: activityId,
						sessionPolicy: manifest.lessonConfig.sessionPolicy,
						allowRestart: manifest.lessonConfig.allowRestart,
						draftRevisionId: null,
						publishedRevisionId: null,
						metadata: manifest.lessonConfig.metadata ?? null,
						createdAt: now,
						updatedAt: now
					})
					.run();

				if (rewrittenPublished && publishedRevisionId) {
					tx.insert(interactiveLearningLessonRevision)
						.values({
							id: publishedRevisionId,
							interactiveLearningId: activityId,
							revisionNumber: 1,
							status: 'published',
							definitionJson: LessonRevisionService.serializeDefinition(rewrittenPublished),
							createdBy: input.userId,
							basedOnRevisionId: null,
							publishedAt: now,
							createdAt: now,
							updatedAt: now
						})
						.run();
				}

				tx.insert(interactiveLearningLessonRevision)
					.values({
						id: draftRevisionId,
						interactiveLearningId: activityId,
						revisionNumber: rewrittenPublished ? 2 : 1,
						status: 'draft',
						definitionJson: LessonRevisionService.serializeDefinition(rewrittenDraft),
						createdBy: input.userId,
						basedOnRevisionId: null,
						publishedAt: null,
						createdAt: now,
						updatedAt: now
					})
					.run();

				tx.update(interactiveLearningLesson)
					.set({
						draftRevisionId,
						publishedRevisionId,
						updatedAt: now
					})
					.where(eq(interactiveLearningLesson.id, activityId))
					.run();

				if (importedResources.length > 0) {
					tx.insert(interactiveLearningFile)
						.values(importedResources.map((resource) => resource.record))
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
			const uploadedStorageIds = importedResources
				.map((resource) => resource.record.fileStorageId)
				.filter((fileId): fileId is string => Boolean(fileId));
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
			revisionCount: importedRevisionCount,
			formatVersion: manifest.formatVersion
		};
	}
}
