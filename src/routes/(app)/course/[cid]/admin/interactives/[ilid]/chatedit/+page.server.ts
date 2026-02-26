import type { PageServerLoad } from './$types';
import { db, CourseInteractiveAuthUtils } from '$lib/server/db';
import {
    interactiveLearning,
    interactiveLearningChat,
    interactiveLearningChatFile,
    interactiveLearningChatRagDocument,
    course,
    courseInteractiveLearning,
    fileType
} from '$lib/server/db/schema';
import type { InteractiveLearningStatusType } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { Actions } from './$types';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { fileSystemSettings } from '$lib/server/files/FileSystemSettings';
import { nanoid } from 'nanoid';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { auditService, auditAction } from '$lib/server/logging';
import {
    deleteCollection,
    getCollectionInfo,
    upsertPoints,
    countPoints,
    deletePoints,
    scrollPoints,
    checkQdrantConnection,
    collectionExists,
    ensureCollection
} from '$lib/server/qdrant';
import { generateEmbeddings, GEMINI_EMBEDDING_DIMENSIONS, getEmbeddingModelInfo } from '$lib/server/qdrant/embeddings';
import { processDocument, processText, type ParsedDocument } from '$lib/server/qdrant/documentProcessor';
import { resolveRagConfig, type RagConfig } from '$lib/server/rag/config';

function getClientIP(request: Request): string | null {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || null;
}

const RAG_FILE_PATH_PREFIX = '/api/files/';
const MIN_RAG_CHUNK_SIZE = 100;
const MAX_RAG_CHUNK_SIZE = 12000;
const MIN_RAG_CHUNK_OVERLAP = 0;
const MAX_RAG_CHUNK_OVERLAP = 4000;
const MIN_RAG_TOP_K = 1;
const MAX_RAG_TOP_K = 20;
const MIN_RAG_MIN_SCORE = 0;
const MAX_RAG_MIN_SCORE = 1;
const MIN_RAG_CONTEXT_MAX_CHARS = 500;
const MAX_RAG_CONTEXT_MAX_CHARS = 24000;
const MIN_RAG_ADJACENCY_WINDOW = 0;
const MAX_RAG_ADJACENCY_WINDOW = 10;
const MIN_RAG_PER_SOURCE_MAX_BLOCKS = 1;
const MAX_RAG_PER_SOURCE_MAX_BLOCKS = 10;
const MIN_RAG_FALLBACK_MIN_SCORE = 0;
const MAX_RAG_FALLBACK_MIN_SCORE = 1;

function parseQdrantPointIds(raw: string | null): string[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

function extractFileId(path: string | null): string | null {
    if (!path || !path.startsWith(RAG_FILE_PATH_PREFIX)) return null;
    return path.slice(RAG_FILE_PATH_PREFIX.length) || null;
}

function parseBooleanFormValue(value: FormDataEntryValue | null, fallback: boolean): boolean {
    if (value === null) return fallback;
    const normalized = value.toString().trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return fallback;
}

function logRagProcessingDiagnostics(args: {
    stage: 'upload' | 'reindex';
    documentId: string;
    documentName: string;
    fileSizeBytes?: number | null;
    parsed: ParsedDocument;
}) {
    const { stage, documentId, documentName, fileSizeBytes, parsed } = args;
    const chunkLengths = parsed.chunks.map((chunk) => chunk.content.length);
    const totalChars = parsed.metadata.totalCharacters;
    const chunkCount = parsed.chunks.length;
    const avgChunkSize = chunkCount > 0
        ? Math.round(chunkLengths.reduce((sum, len) => sum + len, 0) / chunkCount)
        : 0;
    const maxChunkSize = chunkLengths.length > 0 ? Math.max(...chunkLengths) : 0;
    const charsPerByte = fileSizeBytes && fileSizeBytes > 0
        ? Number((totalChars / fileSizeBytes).toFixed(4))
        : null;

    console.info('[RAG] Processing diagnostics', {
        stage,
        documentId,
        documentName,
        fileType: parsed.metadata.fileType,
        totalChars,
        chunkCount,
        avgChunkSize,
        maxChunkSize,
        fileSizeBytes: fileSizeBytes ?? null,
        charsPerByte
    });

    if (fileSizeBytes && fileSizeBytes > 5 * 1024 * 1024 && totalChars < 20_000) {
        console.warn('[RAG] Low text extraction for large file (possible scan/OCR issue)', {
            stage,
            documentId,
            documentName,
            fileSizeBytes,
            totalChars
        });
    }
}

async function ensureRagReady(chat: typeof interactiveLearningChat.$inferSelect) {
    let ragCollectionName = chat.ragCollectionName;
    const ragConfig = resolveRagConfig(chat.ragConfig);
    if (!ragCollectionName) {
        ragCollectionName = `chat_${chat.id.replace(/-/g, '_')}`;
    }

    const ensureResult = await ensureCollection(
        ragCollectionName,
        GEMINI_EMBEDDING_DIMENSIONS,
        'Cosine'
    );

    if (!ensureResult.success) {
        throw error(500, `Error ensuring Qdrant collection: ${ensureResult.error}`);
    }

    if (!chat.ragEnabled || chat.ragCollectionName !== ragCollectionName) {
        await db.update(interactiveLearningChat)
            .set({
                ragEnabled: true,
                ragCollectionName,
                ragConfig
            })
            .where(eq(interactiveLearningChat.id, chat.id));
    }

    return {
        ...chat,
        ragEnabled: true,
        ragCollectionName,
        ragConfig
    };
}

type RagSyncSummary = {
    orphanVectorsRemoved: number;
    indexedDocuments: number;
    processingDocuments: number;
    errorDocuments: number;
};

async function syncRagWithQdrant(
    chatId: string,
    collectionName: string,
    ragDocuments: Array<typeof interactiveLearningChatRagDocument.$inferSelect>
): Promise<RagSyncSummary> {
    const knownDocumentIds = new Set(ragDocuments.map((doc) => doc.id));
    const vectorsByDocumentId = new Map<string, string[]>();
    const orphanVectorIds: Array<string | number> = [];

    let offset: string | number | null | undefined = undefined;
    for (let page = 0; page < 1000; page += 1) {
        const scrollResult = await scrollPoints(collectionName, 128, offset, true, false);
        if (!scrollResult.success) {
            console.warn(`[RAG] Failed to scroll points for sync on chat ${chatId}: ${scrollResult.error}`);
            break;
        }

        if (!scrollResult.points || scrollResult.points.length === 0) {
            break;
        }

        for (const point of scrollResult.points) {
            const pointId = point.id;
            const docId = typeof point.payload?.documentId === 'string' ? point.payload.documentId : null;

            if (docId && knownDocumentIds.has(docId)) {
                const current = vectorsByDocumentId.get(docId) ?? [];
                current.push(String(pointId));
                vectorsByDocumentId.set(docId, current);
            } else {
                orphanVectorIds.push(pointId);
            }
        }

        const nextOffset = scrollResult.nextOffset;
        if (typeof nextOffset !== 'string' && typeof nextOffset !== 'number') {
            break;
        }
        offset = nextOffset;
    }

    if (orphanVectorIds.length > 0) {
        const cleanupResult = await deletePoints(collectionName, orphanVectorIds);
        if (!cleanupResult.success) {
            console.warn(`[RAG] Failed to cleanup orphan vectors in ${collectionName}: ${cleanupResult.error}`);
        }
    }

    for (const doc of ragDocuments) {
        const currentPointIds = vectorsByDocumentId.get(doc.id) ?? [];
        const storedPointIds = parseQdrantPointIds(doc.qdrantPointIds);

        if (currentPointIds.length > 0 && (doc.status !== 'indexed' || doc.chunkCount !== currentPointIds.length || storedPointIds.length !== currentPointIds.length)) {
            await db.update(interactiveLearningChatRagDocument)
                .set({
                    status: 'indexed',
                    chunkCount: currentPointIds.length,
                    qdrantPointIds: JSON.stringify(currentPointIds),
                    errorMessage: null,
                    updatedAt: new Date()
                })
                .where(eq(interactiveLearningChatRagDocument.id, doc.id));
            continue;
        }

        if (doc.status === 'indexed' && currentPointIds.length === 0) {
            await db.update(interactiveLearningChatRagDocument)
                .set({
                    status: 'error',
                    errorMessage: 'No se encontraron embeddings para este documento en Qdrant.',
                    chunkCount: 0,
                    qdrantPointIds: null,
                    updatedAt: new Date()
                })
                .where(eq(interactiveLearningChatRagDocument.id, doc.id));
        }
    }

    const refreshedDocuments = await db.select()
        .from(interactiveLearningChatRagDocument)
        .where(eq(interactiveLearningChatRagDocument.interactiveLearningChatId, chatId))
        .all();

    return {
        orphanVectorsRemoved: orphanVectorIds.length,
        indexedDocuments: refreshedDocuments.filter((doc) => doc.status === 'indexed').length,
        processingDocuments: refreshedDocuments.filter((doc) => doc.status === 'processing').length,
        errorDocuments: refreshedDocuments.filter((doc) => doc.status === 'error').length
    };
}

async function findPointIdsByDocumentId(
    collectionName: string,
    documentId: string
): Promise<Array<string | number>> {
    const pointIds: Array<string | number> = [];
    let offset: string | number | null | undefined = undefined;

    for (let page = 0; page < 1000; page += 1) {
        const scrollResult = await scrollPoints(collectionName, 128, offset, true, false);
        if (!scrollResult.success || !scrollResult.points || scrollResult.points.length === 0) {
            break;
        }

        for (const point of scrollResult.points) {
            if (point.payload?.documentId === documentId) {
                pointIds.push(point.id);
            }
        }

        const nextOffset = scrollResult.nextOffset;
        if (typeof nextOffset !== 'string' && typeof nextOffset !== 'number') {
            break;
        }
        offset = nextOffset;
    }

    return pointIds;
}

export const load = (async ({ params, locals }) => {
    // Verificación de seguridad (defensa en profundidad)
    if (!locals.user) {
        throw error(401, 'No autorizado');
    }

    const { cid, ilid } = params;
    const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
        locals.user.id, cid, ilid, locals.user.highestRoleLevel
    );

    if (!access.allowed) {
        throw error(403, access.reason || 'No tienes permisos para editar esta actividad');
    }

    const chat = await db.select()
        .from(interactiveLearningChat)
        .where(eq(interactiveLearningChat.id, params.ilid))
        .get();

    if (!chat) throw error(404, 'Chat not found');
    const ragConfig = resolveRagConfig(chat.ragConfig);

    const interactive = await db.select()
        .from(interactiveLearning)
        .where(eq(interactiveLearning.id, params.ilid))
        .get();

    if (!interactive) throw error(404, 'Interactive learning not found');

    const courseInteractive = await db.select()
        .from(courseInteractiveLearning)
        .where(eq(courseInteractiveLearning.interactiveLearningId, params.ilid))
        .get();

    const courseData = courseInteractive ? await db.select()
        .from(course)
        .where(eq(course.id, courseInteractive.courseId))
        .get() : null;

    const files = await db.select()
        .from(interactiveLearningChatFile)
        .where(eq(interactiveLearningChatFile.interactiveLearningChatId, chat.id))
        .all();

    // Cargar documentos RAG
    let ragDocuments = await db.select()
        .from(interactiveLearningChatRagDocument)
        .where(eq(interactiveLearningChatRagDocument.interactiveLearningChatId, chat.id))
        .all();

    // Cargar modelos activos desde el nuevo sistema
    const availableModels = await AIUtils.getAvailableModels();
    const models = availableModels.map(m => ({
        name: m.name,
        provider: m.provider
    }));

    // Obtener modelo por defecto
    const defaultModel = await AIUtils.getDefaultModel();

    // Verificar estado de Qdrant
    const qdrantStatus = await checkQdrantConnection();
    const ragUploadMaxBytes = await fileSystemSettings.getMaxSize('rag_document');

    // Obtener información de la colección RAG si existe
    let ragCollectionInfo = null;
    let ragSyncSummary: RagSyncSummary | null = null;
    if (chat.ragCollectionName && qdrantStatus.connected) {
        const exists = await collectionExists(chat.ragCollectionName);
        if (exists) {
            const collectionInfo = await getCollectionInfo(chat.ragCollectionName);
            if (collectionInfo.success) {
                const pointCount = await countPoints(chat.ragCollectionName);
                ragCollectionInfo = {
                    ...collectionInfo.data,
                    pointCount: pointCount.count || 0
                };
            }

            ragSyncSummary = await syncRagWithQdrant(chat.id, chat.ragCollectionName, ragDocuments);
            ragDocuments = await db.select()
                .from(interactiveLearningChatRagDocument)
                .where(eq(interactiveLearningChatRagDocument.interactiveLearningChatId, chat.id))
                .all();
        } else {
            // La colección no existe pero está registrada en la BD - limpiar
            console.log(`[RAG] Collection ${chat.ragCollectionName} does not exist, cleaning up DB reference`);
            await db.update(interactiveLearningChat)
                .set({ ragCollectionName: null, ragEnabled: false })
                .where(eq(interactiveLearningChat.id, chat.id));

            // Limpiar documentos huérfanos
            await db.delete(interactiveLearningChatRagDocument)
                .where(eq(interactiveLearningChatRagDocument.interactiveLearningChatId, chat.id));

            // Recargar chat para tener datos actualizados
            const updatedChat = await db.select()
                .from(interactiveLearningChat)
                .where(eq(interactiveLearningChat.id, params.ilid))
                .get();

            if (updatedChat) {
                return {
                    chat: updatedChat,
                    ragConfig: resolveRagConfig(updatedChat.ragConfig),
                    interactive,
                    course: courseData,
                    files,
                    ragDocuments: [],
                    ragUploadMaxBytes,
                    models,
                    defaultModel,
                    qdrantStatus,
                    ragCollectionInfo: null,
                    ragTechnicalInfo: null
                };
            }
        }
    }

    const embeddingInfo = getEmbeddingModelInfo();
    const ragTechnicalInfo = {
        embeddingModel: embeddingInfo.model,
        embeddingProvider: embeddingInfo.provider,
        embeddingDimensions: embeddingInfo.dimensions,
        collectionName: chat.ragCollectionName,
        documentCount: ragDocuments.length,
        indexedDocuments: ragSyncSummary?.indexedDocuments ?? ragDocuments.filter((doc) => doc.status === 'indexed').length,
        processingDocuments: ragSyncSummary?.processingDocuments ?? ragDocuments.filter((doc) => doc.status === 'processing').length,
        errorDocuments: ragSyncSummary?.errorDocuments ?? ragDocuments.filter((doc) => doc.status === 'error').length,
        orphanVectorsRemoved: ragSyncSummary?.orphanVectorsRemoved ?? 0,
        pointCount: ragCollectionInfo?.pointCount ?? 0
    };

    return {
        chat,
        ragConfig,
        interactive,
        course: courseData,
        files,
        ragDocuments,
        ragUploadMaxBytes,
        models,
        defaultModel,
        qdrantStatus,
        ragCollectionInfo,
        ragTechnicalInfo
    };
}) satisfies PageServerLoad;

export const actions = {
    updateChat: async ({ request, params, locals }) => {
        const formData = await request.formData();
        const description = formData.get('description')?.toString();

        // Obtener status del formulario
        const statusValue = formData.get('status')?.toString();
        const status = (statusValue === 'published' || statusValue === 'closed' || statusValue === 'archived' || statusValue === 'hidden')
            ? statusValue
            : 'hidden';

        const data = {
            llmRole: formData.get('llmRole')?.toString(),
            llmInstructions: formData.get('llmInstructions')?.toString(),
            llmModel: formData.get('llmModel')?.toString(),
            llmContext: formData.get('llmContext')?.toString(),
            systemPrompt: formData.get('systemPrompt')?.toString(),
            temperature: formData.get('temperature') ? parseFloat(formData.get('temperature')?.toString() || '0') : null,
            maxTokens: formData.get('maxTokens') ? parseInt(formData.get('maxTokens')?.toString() || '0') : null,
            topP: formData.get('topP') ? parseFloat(formData.get('topP')?.toString() || '0') : null
        };

        const chat = await db.select()
            .from(interactiveLearningChat)
            .where(eq(interactiveLearningChat.id, params.ilid))
            .get();

        if (!chat) throw error(404, 'Chat not found');

        // Obtener nombre de la actividad para el log
        const interactive = await db.select({ name: interactiveLearning.name })
            .from(interactiveLearning)
            .where(eq(interactiveLearning.id, params.ilid))
            .get();

        // Obtener estado anterior para determinar cambios de ciclo de vida
        const currentInteractive = await db.select({ status: interactiveLearning.status })
            .from(interactiveLearning)
            .where(eq(interactiveLearning.id, params.ilid))
            .get();

        const now = new Date();

        // Determinar timestamps basado en cambios de estado
        const updateData: {
            description: string | undefined;
            status: InteractiveLearningStatusType;
            updatedAt: Date;
            publishedAt?: Date | null;
            closedAt?: Date | null;
            archivedAt?: Date | null;
        } = {
            description,
            status: status as InteractiveLearningStatusType,
            updatedAt: now
        };

        // Si cambia a published y no estaba published, establecer publishedAt
        if (status === 'published' && currentInteractive?.status !== 'published') {
            updateData.publishedAt = now;
        }
        // Si cambia a closed, establecer closedAt
        if (status === 'closed' && currentInteractive?.status !== 'closed') {
            updateData.closedAt = now;
        }
        // Si cambia a archived, establecer archivedAt
        if (status === 'archived' && currentInteractive?.status !== 'archived') {
            updateData.archivedAt = now;
        }

        // Actualizar la descripción y status en interactive learning
        await db.update(interactiveLearning)
            .set(updateData)
            .where(eq(interactiveLearning.id, params.ilid));

        // Actualizar el chat
        await db.update(interactiveLearningChat)
            .set({
                ...data,
            })
            .where(eq(interactiveLearningChat.id, chat.id));

        // Audit log
        await auditService.log({
            action: auditAction.ACTIVITY_UPDATED,
            userId: locals.user?.id,
            targetType: 'activity',
            targetId: params.ilid,
            details: { name: interactive?.name, description, status, llmModel: data.llmModel, courseId: params.cid },
            ipAddress: getClientIP(request),
            userAgent: request.headers.get('user-agent'),
            severity: 'info'
        });

        return { success: true };
    },

    // ========== RAG Actions ==========

    updateRagSettings: async ({ request, params }) => {
        const formData = await request.formData();

        const ragChunkSize = parseInt(formData.get('ragChunkSize')?.toString() || '1000', 10);
        const ragChunkOverlap = parseInt(formData.get('ragChunkOverlap')?.toString() || '200', 10);
        const ragTopK = parseInt(formData.get('ragTopK')?.toString() || '5', 10);
        const ragMinScore = parseFloat(formData.get('ragMinScore')?.toString() || '0.7');
        const ragContextMaxChars = parseInt(formData.get('ragContextMaxChars')?.toString() || '6000', 10);
        const ragMergeAdjacentChunks = parseBooleanFormValue(
            formData.get('ragMergeAdjacentChunks'),
            true
        );
        const ragAdjacencyWindow = parseInt(formData.get('ragAdjacencyWindow')?.toString() || '0', 10);
        const ragPerSourceMaxBlocks = parseInt(formData.get('ragPerSourceMaxBlocks')?.toString() || '3', 10);
        const ragFallbackMinScore = parseFloat(formData.get('ragFallbackMinScore')?.toString() || '0.45');

        if (!Number.isFinite(ragChunkSize) || ragChunkSize < MIN_RAG_CHUNK_SIZE || ragChunkSize > MAX_RAG_CHUNK_SIZE) {
            throw error(400, `ragChunkSize debe estar entre ${MIN_RAG_CHUNK_SIZE} y ${MAX_RAG_CHUNK_SIZE}.`);
        }
        if (!Number.isFinite(ragChunkOverlap) || ragChunkOverlap < MIN_RAG_CHUNK_OVERLAP || ragChunkOverlap > MAX_RAG_CHUNK_OVERLAP) {
            throw error(400, `ragChunkOverlap debe estar entre ${MIN_RAG_CHUNK_OVERLAP} y ${MAX_RAG_CHUNK_OVERLAP}.`);
        }
        if (ragChunkOverlap >= ragChunkSize) {
            throw error(400, 'ragChunkOverlap debe ser menor que ragChunkSize.');
        }
        if (!Number.isFinite(ragTopK) || ragTopK < MIN_RAG_TOP_K || ragTopK > MAX_RAG_TOP_K) {
            throw error(400, `ragTopK debe estar entre ${MIN_RAG_TOP_K} y ${MAX_RAG_TOP_K}.`);
        }
        if (!Number.isFinite(ragMinScore) || ragMinScore < MIN_RAG_MIN_SCORE || ragMinScore > MAX_RAG_MIN_SCORE) {
            throw error(400, `ragMinScore debe estar entre ${MIN_RAG_MIN_SCORE} y ${MAX_RAG_MIN_SCORE}.`);
        }
        if (
            !Number.isFinite(ragContextMaxChars) ||
            ragContextMaxChars < MIN_RAG_CONTEXT_MAX_CHARS ||
            ragContextMaxChars > MAX_RAG_CONTEXT_MAX_CHARS
        ) {
            throw error(
                400,
                `ragContextMaxChars debe estar entre ${MIN_RAG_CONTEXT_MAX_CHARS} y ${MAX_RAG_CONTEXT_MAX_CHARS}.`
            );
        }
        if (
            !Number.isFinite(ragAdjacencyWindow) ||
            ragAdjacencyWindow < MIN_RAG_ADJACENCY_WINDOW ||
            ragAdjacencyWindow > MAX_RAG_ADJACENCY_WINDOW
        ) {
            throw error(
                400,
                `ragAdjacencyWindow debe estar entre ${MIN_RAG_ADJACENCY_WINDOW} y ${MAX_RAG_ADJACENCY_WINDOW}.`
            );
        }
        if (
            !Number.isFinite(ragPerSourceMaxBlocks) ||
            ragPerSourceMaxBlocks < MIN_RAG_PER_SOURCE_MAX_BLOCKS ||
            ragPerSourceMaxBlocks > MAX_RAG_PER_SOURCE_MAX_BLOCKS
        ) {
            throw error(
                400,
                `ragPerSourceMaxBlocks debe estar entre ${MIN_RAG_PER_SOURCE_MAX_BLOCKS} y ${MAX_RAG_PER_SOURCE_MAX_BLOCKS}.`
            );
        }
        if (
            !Number.isFinite(ragFallbackMinScore) ||
            ragFallbackMinScore < MIN_RAG_FALLBACK_MIN_SCORE ||
            ragFallbackMinScore > MAX_RAG_FALLBACK_MIN_SCORE
        ) {
            throw error(
                400,
                `ragFallbackMinScore debe estar entre ${MIN_RAG_FALLBACK_MIN_SCORE} y ${MAX_RAG_FALLBACK_MIN_SCORE}.`
            );
        }

        const chat = await db.select()
            .from(interactiveLearningChat)
            .where(eq(interactiveLearningChat.id, params.ilid))
            .get();

        if (!chat) throw error(404, 'Chat not found');
        const previousRagConfig = resolveRagConfig(chat.ragConfig);
        const ragDocuments = await db.select({
            id: interactiveLearningChatRagDocument.id,
            originalPath: interactiveLearningChatRagDocument.originalPath
        })
            .from(interactiveLearningChatRagDocument)
            .where(eq(interactiveLearningChatRagDocument.interactiveLearningChatId, chat.id))
            .all();
        const ragEnabled = ragDocuments.length > 0;

        const chunkingChanged =
            previousRagConfig.chunkSize !== ragChunkSize ||
            previousRagConfig.chunkOverlap !== ragChunkOverlap;

        let reindexSummary: {
            totalDocuments: number;
            fileDocuments: number;
            textDocuments: number;
        } | null = null;

        if (ragEnabled && chunkingChanged) {
            reindexSummary = {
                totalDocuments: ragDocuments.length,
                fileDocuments: ragDocuments.filter((doc) => !!doc.originalPath).length,
                textDocuments: ragDocuments.filter((doc) => !doc.originalPath).length
            };
        }

        // Si se activa RAG, asegurar que la colección existe
        let ragCollectionName = chat.ragCollectionName;
        if (ragEnabled) {
            if (!ragCollectionName) {
                ragCollectionName = `chat_${chat.id.replace(/-/g, '_')}`;
            }

            // Usar ensureCollection para crear si no existe
            const ensureResult = await ensureCollection(
                ragCollectionName,
                GEMINI_EMBEDDING_DIMENSIONS,
                'Cosine'
            );

            if (!ensureResult.success) {
                throw error(500, `Error ensuring Qdrant collection: ${ensureResult.error}`);
            }

            if (ensureResult.created) {
                console.log(`[RAG] Created new collection: ${ragCollectionName}`);
            }
        }

        // Si no hay documentos, desactivar RAG y limpiar la colección
        if (!ragEnabled && chat.ragCollectionName) {
            // Intentar eliminar la colección (puede que no exista)
            const exists = await collectionExists(chat.ragCollectionName);
            if (exists) {
                await deleteCollection(chat.ragCollectionName);
                console.log(`[RAG] Deleted collection: ${chat.ragCollectionName}`);
            }
            ragCollectionName = null;

            // Eliminar documentos de la base de datos
            await db.delete(interactiveLearningChatRagDocument)
                .where(eq(interactiveLearningChatRagDocument.interactiveLearningChatId, chat.id));
        }

        const ragConfig: RagConfig = {
            ...previousRagConfig,
            chunkSize: ragChunkSize,
            chunkOverlap: ragChunkOverlap,
            topK: ragTopK,
            minScore: ragMinScore,
            contextMaxChars: ragContextMaxChars,
            mergeAdjacentChunks: ragMergeAdjacentChunks,
            adjacencyWindow: ragAdjacencyWindow,
            perSourceMaxBlocks: ragPerSourceMaxBlocks,
            fallbackMinScore: ragFallbackMinScore
        };

        await db.update(interactiveLearningChat)
            .set({
                ragEnabled,
                ragCollectionName,
                ragConfig
            })
            .where(eq(interactiveLearningChat.id, chat.id));

        return {
            success: true,
            requiresReindex: !!reindexSummary && reindexSummary.totalDocuments > 0,
            reindexSummary,
            changed: {
                chunkingChanged
            }
        };
    },

    uploadRagDocument: async ({ request, params, locals }) => {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) throw error(400, 'No file provided');

        const chat = await db.select()
            .from(interactiveLearningChat)
            .where(eq(interactiveLearningChat.id, params.ilid))
            .get();

        if (!chat) throw error(404, 'Chat not found');
        const readyChat = await ensureRagReady(chat);

        // Upload original file to new storage system for reference
        const uploadResult = await fileStorageService.upload({
            file,
            category: 'rag_document',
            entityType: 'interactive_learning',
            entityId: chat.id,
            uploadedBy: locals.user?.id || 'system',
            displayName: file.name,
            visibility: 'private'
        });

        if (!uploadResult.success) {
            throw error(500, uploadResult.error || 'Error al subir el documento');
        }

        // Asegurar que la colección existe antes de subir
        const now = new Date();
        const docId = nanoid();
        const ragConfig = resolveRagConfig(chat.ragConfig);

        // Crear registro del documento
        await db.insert(interactiveLearningChatRagDocument).values({
            id: docId,
            interactiveLearningChatId: chat.id,
            name: file.name,
            originalPath: `/api/files/${uploadResult.fileId}`,
            fileType: file.name.split('.').pop() || 'unknown',
            fileSize: file.size,
            status: 'processing',
            createdAt: now,
            updatedAt: now
        });

        try {
            // Procesar documento
            const fileBuffer = await file.arrayBuffer();
            const doc = await processDocument(
                fileBuffer,
                file.name,
                {
                    chunkSize: ragConfig.chunkSize,
                    chunkOverlap: ragConfig.chunkOverlap,
                    fileTypeHint: file.name.split('.').pop() || null,
                    mimeType: file.type || null
                }
            );
            logRagProcessingDiagnostics({
                stage: 'upload',
                documentId: docId,
                documentName: file.name,
                fileSizeBytes: file.size,
                parsed: doc
            });

            // Generar embeddings
            const contents = doc.chunks.map(chunk => chunk.content);
            const embeddings = await generateEmbeddings(contents);

            // Preparar puntos para Qdrant
            const pointIds: string[] = [];
            const points = doc.chunks.map((chunk, index) => {
                const pointId = randomUUID();
                pointIds.push(pointId);
                return {
                    id: pointId,
                    vector: embeddings[index],
                    payload: {
                        content: chunk.content,
                        source: file.name,
                        documentId: docId,
                        chunkIndex: chunk.metadata.chunkIndex,
                        totalChunks: chunk.metadata.totalChunks,
                        uploadedAt: now.toISOString()
                    }
                };
            });

            // Insertar en Qdrant
            const upsertResult = await upsertPoints(readyChat.ragCollectionName, points);

            if (!upsertResult.success) {
                throw new Error(`Failed to upsert points: ${upsertResult.error}`);
            }

            // Actualizar registro del documento
            await db.update(interactiveLearningChatRagDocument)
                .set({
                    status: 'indexed',
                    chunkCount: doc.chunks.length,
                    totalCharacters: doc.metadata.totalCharacters,
                    qdrantPointIds: JSON.stringify(pointIds),
                    updatedAt: new Date()
                })
                .where(eq(interactiveLearningChatRagDocument.id, docId));

            return { success: true, documentId: docId };
        } catch (e) {
            const rawMessage = e instanceof Error ? e.message : 'Unknown error';
            const friendlyMessage = rawMessage.includes('Invalid embedding response')
                ? 'La API de embeddings devolvió una respuesta inválida. El documento puede ser demasiado grande o requerir procesamiento por lotes.'
                : rawMessage;

            // Marcar documento como error
            await db.update(interactiveLearningChatRagDocument)
                .set({
                    status: 'error',
                    errorMessage: friendlyMessage,
                    updatedAt: new Date()
                })
                .where(eq(interactiveLearningChatRagDocument.id, docId));

            throw error(500, friendlyMessage);
        }
    },

    uploadRagText: async ({ request, params }) => {
        const formData = await request.formData();
        const text = formData.get('text')?.toString();
        const name = formData.get('name')?.toString() || 'Direct Input';

        if (!text) throw error(400, 'No text provided');

        const chat = await db.select()
            .from(interactiveLearningChat)
            .where(eq(interactiveLearningChat.id, params.ilid))
            .get();

        if (!chat) throw error(404, 'Chat not found');
        const readyChat = await ensureRagReady(chat);

        const now = new Date();
        const docId = nanoid();
        const ragConfig = resolveRagConfig(chat.ragConfig);

        // Crear registro del documento
        await db.insert(interactiveLearningChatRagDocument).values({
            id: docId,
            interactiveLearningChatId: chat.id,
            name: name,
            fileType: 'txt',
            fileSize: text.length,
            status: 'processing',
            createdAt: now,
            updatedAt: now
        });

        try {
            // Procesar texto
            const doc = processText(
                text,
                name,
                {
                    chunkSize: ragConfig.chunkSize,
                    chunkOverlap: ragConfig.chunkOverlap
                }
            );

            // Generar embeddings
            const contents = doc.chunks.map(chunk => chunk.content);
            const embeddings = await generateEmbeddings(contents);

            // Preparar puntos para Qdrant
            const pointIds: string[] = [];
            const points = doc.chunks.map((chunk, index) => {
                const pointId = randomUUID();
                pointIds.push(pointId);
                return {
                    id: pointId,
                    vector: embeddings[index],
                    payload: {
                        content: chunk.content,
                        source: name,
                        documentId: docId,
                        chunkIndex: chunk.metadata.chunkIndex,
                        totalChunks: chunk.metadata.totalChunks,
                        uploadedAt: now.toISOString()
                    }
                };
            });

            // Insertar en Qdrant
            const upsertResult = await upsertPoints(readyChat.ragCollectionName, points);

            if (!upsertResult.success) {
                throw new Error(`Failed to upsert points: ${upsertResult.error}`);
            }

            // Actualizar registro del documento
            await db.update(interactiveLearningChatRagDocument)
                .set({
                    status: 'indexed',
                    chunkCount: doc.chunks.length,
                    totalCharacters: doc.metadata.totalCharacters,
                    qdrantPointIds: JSON.stringify(pointIds),
                    updatedAt: new Date()
                })
                .where(eq(interactiveLearningChatRagDocument.id, docId));

            return { success: true, documentId: docId };
        } catch (e) {
            const rawMessage = e instanceof Error ? e.message : 'Unknown error';
            const friendlyMessage = rawMessage.includes('Invalid embedding response')
                ? 'La API de embeddings devolvió una respuesta inválida durante el indexado de texto.'
                : rawMessage;

            // Marcar documento como error
            await db.update(interactiveLearningChatRagDocument)
                .set({
                    status: 'error',
                    errorMessage: friendlyMessage,
                    updatedAt: new Date()
                })
                .where(eq(interactiveLearningChatRagDocument.id, docId));

            throw error(500, friendlyMessage);
        }
    },

    deleteRagDocument: async ({ request, params, locals }) => {
        const formData = await request.formData();
        const documentId = formData.get('documentId')?.toString();

        if (!documentId) throw error(400, 'No document ID provided');

        const chat = await db.select()
            .from(interactiveLearningChat)
            .where(eq(interactiveLearningChat.id, params.ilid))
            .get();

        if (!chat) throw error(404, 'Chat not found');

        const document = await db.select()
            .from(interactiveLearningChatRagDocument)
            .where(eq(interactiveLearningChatRagDocument.id, documentId))
            .get();

        if (!document) throw error(404, 'Document not found');

        // Eliminar puntos de Qdrant si existen
        if (chat.ragCollectionName) {
            let pointIds: Array<string | number> = parseQdrantPointIds(document.qdrantPointIds);

            if (pointIds.length === 0) {
                pointIds = await findPointIdsByDocumentId(chat.ragCollectionName, document.id);
            }

            if (pointIds.length > 0) {
                const deleteResult = await deletePoints(chat.ragCollectionName, pointIds);
                if (!deleteResult.success) {
                    console.warn(`[RAG] Failed to delete points: ${deleteResult.error}`);
                }
            }
        }

        const fileId = extractFileId(document.originalPath);
        if (fileId) {
            const deleteFileResult = await fileStorageService.delete(fileId, locals.user?.id || 'system');
            if (!deleteFileResult.success) {
                console.warn(`[RAG] Failed to delete original file ${fileId}: ${deleteFileResult.error}`);
            }
        }

        // Eliminar registro de la base de datos
        await db.delete(interactiveLearningChatRagDocument)
            .where(eq(interactiveLearningChatRagDocument.id, documentId));

        const remainingDocuments = await db.select({
            id: interactiveLearningChatRagDocument.id
        })
            .from(interactiveLearningChatRagDocument)
            .where(eq(interactiveLearningChatRagDocument.interactiveLearningChatId, chat.id))
            .all();

        // Si ya no quedan documentos, apagar RAG y eliminar colección para evitar residuos en Qdrant.
        if (remainingDocuments.length === 0) {
            if (chat.ragCollectionName) {
                const exists = await collectionExists(chat.ragCollectionName);
                if (exists) {
                    await deleteCollection(chat.ragCollectionName);
                    console.log(`[RAG] Deleted collection after removing last document: ${chat.ragCollectionName}`);
                }
            }

            await db.update(interactiveLearningChat)
                .set({
                    ragCollectionName: null,
                    ragEnabled: false
                })
                .where(eq(interactiveLearningChat.id, chat.id));
        }

        return { success: true };
    },

    reindexRagDocuments: async ({ params, locals }) => {
        const chat = await db.select()
            .from(interactiveLearningChat)
            .where(eq(interactiveLearningChat.id, params.ilid))
            .get();

        if (!chat) throw error(404, 'Chat not found');
        const readyChat = await ensureRagReady(chat);
        const ragConfig = resolveRagConfig(readyChat.ragConfig);

        const documents = await db.select()
            .from(interactiveLearningChatRagDocument)
            .where(eq(interactiveLearningChatRagDocument.interactiveLearningChatId, chat.id))
            .all();

        let reindexed = 0;
        let skippedNoSource = 0;
        let failed = 0;

        for (const document of documents) {
            const fileId = extractFileId(document.originalPath);
            if (!fileId) {
                skippedNoSource += 1;
                continue;
            }

            try {
                const storedFile = await fileStorageService.getFile(fileId);
                if (!storedFile) {
                    throw new Error('Archivo original no disponible en file storage.');
                }

                const filePath = fileStorageService.getPhysicalPath(storedFile);
                const fileBuffer = await fs.readFile(filePath);

                let previousPointIds: Array<string | number> = parseQdrantPointIds(document.qdrantPointIds);
                if (previousPointIds.length === 0) {
                    previousPointIds = await findPointIdsByDocumentId(readyChat.ragCollectionName, document.id);
                }
                if (previousPointIds.length > 0) {
                    await deletePoints(readyChat.ragCollectionName, previousPointIds);
                }

                const processed = await processDocument(
                    fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength),
                    document.name,
                    {
                        chunkSize: ragConfig.chunkSize,
                        chunkOverlap: ragConfig.chunkOverlap,
                        fileTypeHint: document.fileType,
                        mimeType: storedFile.mimeType
                    }
                );
                logRagProcessingDiagnostics({
                    stage: 'reindex',
                    documentId: document.id,
                    documentName: document.name,
                    fileSizeBytes: storedFile.size,
                    parsed: processed
                });

                const contents = processed.chunks.map((chunk) => chunk.content);
                const embeddings = await generateEmbeddings(contents);

                const pointIds: string[] = [];
                const points = processed.chunks.map((chunk, index) => {
                    const pointId = randomUUID();
                    pointIds.push(pointId);
                    return {
                        id: pointId,
                        vector: embeddings[index],
                        payload: {
                            content: chunk.content,
                            source: document.name,
                            documentId: document.id,
                            chunkIndex: chunk.metadata.chunkIndex,
                            totalChunks: chunk.metadata.totalChunks,
                            uploadedAt: new Date().toISOString()
                        }
                    };
                });

                const upsertResult = await upsertPoints(readyChat.ragCollectionName, points);
                if (!upsertResult.success) {
                    throw new Error(`Error al insertar embeddings: ${upsertResult.error}`);
                }

                await db.update(interactiveLearningChatRagDocument)
                    .set({
                        status: 'indexed',
                        chunkCount: processed.chunks.length,
                        totalCharacters: processed.metadata.totalCharacters,
                        qdrantPointIds: JSON.stringify(pointIds),
                        errorMessage: null,
                        updatedAt: new Date()
                    })
                    .where(eq(interactiveLearningChatRagDocument.id, document.id));

                reindexed += 1;
            } catch (e) {
                failed += 1;
                await db.update(interactiveLearningChatRagDocument)
                    .set({
                        status: 'error',
                        errorMessage: e instanceof Error ? e.message : 'Error reindexando documento',
                        updatedAt: new Date()
                    })
                    .where(eq(interactiveLearningChatRagDocument.id, document.id));
            }
        }

        await auditService.log({
            action: auditAction.ACTIVITY_UPDATED,
            userId: locals.user?.id,
            targetType: 'activity',
            targetId: params.ilid,
            details: {
                operation: 'rag_reindex',
                reindexed,
                skippedNoSource,
                failed,
                total: documents.length
            },
            severity: failed > 0 ? 'warning' : 'info'
        });

        return {
            success: true,
            summary: {
                total: documents.length,
                reindexed,
                skippedNoSource,
                failed
            }
        };
    },

    // ========== Original File Actions ==========

    uploadFile: async ({ request, params, locals }) => {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const type = formData.get('type')?.toString() as keyof typeof fileType;

        if (!file) throw error(400, 'No file provided');
        if (!type || !fileType[type]) throw error(400, 'Invalid file type');

        const chat = await db.select()
            .from(interactiveLearningChat)
            .where(eq(interactiveLearningChat.id, params.ilid))
            .get();

        if (!chat) throw error(404, 'Chat not found');

        // Upload using new file storage system
        const result = await fileStorageService.upload({
            file,
            category: 'chat',
            entityType: 'interactive_learning',
            entityId: chat.id,
            uploadedBy: locals.user?.id || 'system',
            displayName: file.name,
            visibility: 'restricted'
        });

        if (!result.success) {
            throw error(500, result.error || 'Error al subir el archivo');
        }

        // Save file metadata to database (keeping interactiveLearningChatFile table for now)
        await db.insert(interactiveLearningChatFile).values({
            id: nanoid(),
            interactiveLearningChatId: chat.id,
            name: file.name,
            path: `/api/files/${result.fileId}`,
            type,
            size: file.size,
            mimeType: file.type,
            createdAt: new Date()
        });

        return { success: true };
    },

    deleteFile: async ({ request, locals }) => {
        const formData = await request.formData();
        const fileId = formData.get('fileId')?.toString();

        if (!fileId) throw error(400, 'No file ID provided');

        const fileRecord = await db.select()
            .from(interactiveLearningChatFile)
            .where(eq(interactiveLearningChatFile.id, fileId))
            .get();

        if (!fileRecord) throw error(404, 'File not found');

        const storageFileId = extractFileId(fileRecord.path);
        if (!storageFileId) {
            throw error(400, 'Invalid file path');
        }

        const deleteStorageResult = await fileStorageService.delete(
            storageFileId,
            locals.user?.id || 'system'
        );

        if (!deleteStorageResult.success) {
            throw error(500, deleteStorageResult.error || 'Error deleting file from storage');
        }

        await db.delete(interactiveLearningChatFile)
            .where(eq(interactiveLearningChatFile.id, fileId));

        return { success: true };
    }
} satisfies Actions;
