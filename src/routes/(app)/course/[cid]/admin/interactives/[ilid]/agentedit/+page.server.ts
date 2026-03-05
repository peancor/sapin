import type { PageServerLoad, Actions } from './$types';
import { db, CourseInteractiveAuthUtils } from '$lib/server/db';
import {
    interactiveLearning,
    interactiveLearningAgent,
    interactiveLearningFile,
    interactiveLearningRagDocument,
    fileType
} from '$lib/server/db/schema';
import type { InteractiveLearningStatusType } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { auditService, auditAction } from '$lib/server/logging';
import { DBAgentActivityUtils, DBAgentToolUtils, DBAgentUIUtils } from '$lib/server/db/agent';
import { fileStorageService } from '$lib/server/files/FileStorageService';
import { fileSystemSettings } from '$lib/server/files/FileSystemSettings';
import { nanoid } from 'nanoid';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
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
import {
    generateEmbeddings,
    GEMINI_EMBEDDING_DIMENSIONS,
    getEmbeddingModelInfo
} from '$lib/server/qdrant/embeddings';
import { processDocument, processText, type ParsedDocument } from '$lib/server/qdrant/documentProcessor';
import { resolveRagConfig, type RagConfig } from '$lib/server/rag/config';

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

type RagSyncSummary = {
    orphanVectorsRemoved: number;
    indexedDocuments: number;
    processingDocuments: number;
    errorDocuments: number;
};

function getClientIP(request: Request): string | null {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || null;
}

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

    console.info('[RAG][agent] Processing diagnostics', {
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
}

async function requireAgentAdminContext(
    cid: string,
    ilid: string,
    locals: { user?: { id: string; highestRoleLevel: number } | null }
) {
    if (!locals.user) throw error(401, 'Unauthorized');

    const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
        locals.user.id,
        cid,
        ilid,
        locals.user.highestRoleLevel
    );
    if (!access.allowed) {
        throw error(403, access.reason || 'No tienes permisos para administrar esta actividad');
    }

    const interactive = await db
        .select()
        .from(interactiveLearning)
        .where(eq(interactiveLearning.id, ilid))
        .get();
    if (!interactive) throw error(404, 'Actividad no encontrada');
    if (interactive.type !== 'agent') throw error(400, 'Esta actividad no es de tipo agente');

    const agentConfig = await DBAgentActivityUtils.getAgentActivity(ilid);
    if (!agentConfig) throw error(404, 'Configuración agéntica no encontrada');

    return { user: locals.user, interactive, agentConfig };
}

async function ensureAgentRagReady(agent: typeof interactiveLearningAgent.$inferSelect) {
    let ragCollectionName = agent.ragCollectionName;
    const ragConfig = resolveRagConfig(agent.ragConfig);
    const ragConfigRaw = JSON.stringify(ragConfig);

    if (!ragCollectionName) {
        ragCollectionName = `agent_${agent.id.replace(/-/g, '_')}`;
    }

    const ensureResult = await ensureCollection(
        ragCollectionName,
        GEMINI_EMBEDDING_DIMENSIONS,
        'Cosine'
    );

    if (!ensureResult.success) {
        throw error(500, `Error ensuring Qdrant collection: ${ensureResult.error}`);
    }

    if (!agent.ragEnabled || agent.ragCollectionName !== ragCollectionName || agent.ragConfig !== ragConfigRaw) {
        await db.update(interactiveLearningAgent)
            .set({
                ragEnabled: true,
                ragCollectionName,
                ragConfig: ragConfigRaw
            })
            .where(eq(interactiveLearningAgent.id, agent.id));
    }

    return {
        ...agent,
        ragEnabled: true,
        ragCollectionName,
        ragConfig: ragConfigRaw
    };
}

async function syncRagWithQdrant(
    activityId: string,
    collectionName: string,
    ragDocuments: Array<typeof interactiveLearningRagDocument.$inferSelect>
): Promise<RagSyncSummary> {
    const knownDocumentIds = new Set(ragDocuments.map((doc) => doc.id));
    const vectorsByDocumentId = new Map<string, string[]>();
    const orphanVectorIds: Array<string | number> = [];

    let offset: string | number | null | undefined = undefined;
    for (let page = 0; page < 1000; page += 1) {
        const scrollResult = await scrollPoints(collectionName, 128, offset, true, false);
        if (!scrollResult.success) break;
        if (!scrollResult.points || scrollResult.points.length === 0) break;

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
        if (typeof nextOffset !== 'string' && typeof nextOffset !== 'number') break;
        offset = nextOffset;
    }

    if (orphanVectorIds.length > 0) {
        await deletePoints(collectionName, orphanVectorIds);
    }

    for (const doc of ragDocuments) {
        const currentPointIds = vectorsByDocumentId.get(doc.id) ?? [];
        const storedPointIds = parseQdrantPointIds(doc.qdrantPointIds);

        if (currentPointIds.length > 0 && (doc.status !== 'indexed' || doc.chunkCount !== currentPointIds.length || storedPointIds.length !== currentPointIds.length)) {
            await db.update(interactiveLearningRagDocument)
                .set({
                    status: 'indexed',
                    chunkCount: currentPointIds.length,
                    qdrantPointIds: JSON.stringify(currentPointIds),
                    errorMessage: null,
                    updatedAt: new Date()
                })
                .where(eq(interactiveLearningRagDocument.id, doc.id));
        }
    }

    const refreshedDocuments = await db.select()
        .from(interactiveLearningRagDocument)
        .where(eq(interactiveLearningRagDocument.interactiveLearningId, activityId))
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
        if (!scrollResult.success || !scrollResult.points || scrollResult.points.length === 0) break;

        for (const point of scrollResult.points) {
            if (point.payload?.documentId === documentId) {
                pointIds.push(point.id);
            }
        }

        const nextOffset = scrollResult.nextOffset;
        if (typeof nextOffset !== 'string' && typeof nextOffset !== 'number') break;
        offset = nextOffset;
    }

    return pointIds;
}

export const load = (async ({ params, locals }) => {
    const { cid, ilid } = params;
    const { interactive, agentConfig } = await requireAgentAdminContext(cid, ilid, locals);

    const availableModels = await AIUtils.getAvailableModels();
    const models = availableModels.map((m) => ({ name: m.name, provider: m.provider }));
    const defaultModel = await AIUtils.getDefaultModel();
    const ragConfig = resolveRagConfig(agentConfig.ragConfig);

    await DBAgentToolUtils.seedBuiltinTools();
    await DBAgentUIUtils.seedBuiltinUIComponents();
    const activeTools = await DBAgentToolUtils.getActiveToolDefinitions();
    const activeUIComponents = await DBAgentUIUtils.getAllUIComponents();
    const availableUIComponentKeys = activeUIComponents.map((component) => component.componentKey);

    const enabledTools = await DBAgentActivityUtils.getEnabledToolsForActivity(ilid);
    const assignedToolIds = enabledTools.map((t) => t.id);

    const files = await db
        .select()
        .from(interactiveLearningFile)
        .where(eq(interactiveLearningFile.interactiveLearningId, ilid))
        .all();

    let ragDocuments = await db
        .select()
        .from(interactiveLearningRagDocument)
        .where(eq(interactiveLearningRagDocument.interactiveLearningId, ilid))
        .all();

    const qdrantStatus = await checkQdrantConnection();
    const ragUploadMaxBytes = await fileSystemSettings.getMaxSize('rag_document');

    let ragCollectionInfo = null;
    let ragSyncSummary: RagSyncSummary | null = null;
    if (agentConfig.ragCollectionName && qdrantStatus.connected) {
        const exists = await collectionExists(agentConfig.ragCollectionName);
        if (exists) {
            const collectionInfo = await getCollectionInfo(agentConfig.ragCollectionName);
            if (collectionInfo.success) {
                const pointCount = await countPoints(agentConfig.ragCollectionName);
                ragCollectionInfo = {
                    ...collectionInfo.data,
                    pointCount: pointCount.count || 0
                };
            }

            ragSyncSummary = await syncRagWithQdrant(ilid, agentConfig.ragCollectionName, ragDocuments);
            ragDocuments = await db
                .select()
                .from(interactiveLearningRagDocument)
                .where(eq(interactiveLearningRagDocument.interactiveLearningId, ilid))
                .all();
        }
    }

    const embeddingInfo = getEmbeddingModelInfo();
    const ragTechnicalInfo = {
        embeddingModel: embeddingInfo.model,
        embeddingProvider: embeddingInfo.provider,
        embeddingDimensions: embeddingInfo.dimensions,
        collectionName: agentConfig.ragCollectionName,
        documentCount: ragDocuments.length,
        indexedDocuments: ragSyncSummary?.indexedDocuments ?? ragDocuments.filter((doc) => doc.status === 'indexed').length,
        processingDocuments: ragSyncSummary?.processingDocuments ?? ragDocuments.filter((doc) => doc.status === 'processing').length,
        errorDocuments: ragSyncSummary?.errorDocuments ?? ragDocuments.filter((doc) => doc.status === 'error').length,
        orphanVectorsRemoved: ragSyncSummary?.orphanVectorsRemoved ?? 0,
        pointCount: ragCollectionInfo?.pointCount ?? 0
    };

    return {
        interactive,
        agentConfig,
        ragConfig,
        files,
        ragDocuments,
        ragUploadMaxBytes,
        qdrantStatus,
        ragCollectionInfo,
        ragTechnicalInfo,
        models,
        defaultModel,
        activeTools,
        availableUIComponentKeys,
        assignedToolIds
    };
}) satisfies PageServerLoad;

export const actions = {
    updateAgent: async ({ request, params, locals }) => {
        const { cid, ilid } = params;
        await requireAgentAdminContext(cid, ilid, locals);

        const data = await request.formData();
        const description = data.get('description')?.toString() ?? '';
        const statusValue = data.get('status')?.toString();
        const status = (['hidden', 'published', 'closed', 'archived'].includes(statusValue ?? ''))
            ? (statusValue as InteractiveLearningStatusType)
            : 'hidden';

        const llmRole = data.get('llmRole')?.toString() ?? '';
        const llmInstructions = data.get('llmInstructions')?.toString() ?? '';
        const llmModel = data.get('llmModel')?.toString() ?? '';
        const llmContext = data.get('llmContext')?.toString() ?? '';
        const systemPrompt = data.get('systemPrompt')?.toString() ?? '';
        const temperature = data.get('temperature') ? parseFloat(data.get('temperature')!.toString()) : 0.7;
        const maxTokens = data.get('maxTokens') ? parseInt(data.get('maxTokens')!.toString()) : 2000;
        const topP = data.get('topP') ? parseFloat(data.get('topP')!.toString()) : 0.9;

        const maxToolRoundtrips = data.get('maxToolRoundtrips') ? parseInt(data.get('maxToolRoundtrips')!.toString()) : 5;
        const parallelToolCalls = data.get('parallelToolCalls') === 'on' || data.get('parallelToolCalls') === 'true';
        const toolChoiceRaw = data.get('toolChoice')?.toString();
        const toolChoice = (['auto', 'required', 'none'].includes(toolChoiceRaw ?? ''))
            ? (toolChoiceRaw as 'auto' | 'required' | 'none')
            : 'auto';
        const finalizationEnabledRaw = data.get('finalizationEnabled')?.toString();
        const finalizationEnabled = finalizationEnabledRaw === undefined || finalizationEnabledRaw === null
            ? true
            : finalizationEnabledRaw === 'on' || finalizationEnabledRaw === 'true';
        const finalizationToolName = data.get('finalizationToolName')?.toString().trim() || 'finalize_activity';
        const finalizationHandlerRaw = data.get('finalizationHandler')?.toString();
        const finalizationHandler = (['mark_complete_and_notify', 'mark_complete_only', 'notify_only'].includes(finalizationHandlerRaw ?? ''))
            ? (finalizationHandlerRaw as 'mark_complete_and_notify' | 'mark_complete_only' | 'notify_only')
            : 'mark_complete_and_notify';
        const requireFinalizationToolCallRaw = data.get('requireFinalizationToolCall')?.toString();
        const requireFinalizationToolCall = requireFinalizationToolCallRaw === undefined || requireFinalizationToolCallRaw === null
            ? true
            : requireFinalizationToolCallRaw === 'on' || requireFinalizationToolCallRaw === 'true';
        const finalizationConfigRaw = data.get('finalizationConfig')?.toString().trim() || '';
        let finalizationConfig: string | null = null;
        if (finalizationConfigRaw) {
            try {
                JSON.parse(finalizationConfigRaw);
                finalizationConfig = finalizationConfigRaw;
            } catch {
                throw error(400, 'finalizationConfig debe ser JSON valido');
            }
        }

        let selectedToolIds: string[] = [];
        try {
            const raw = data.get('selectedToolIds')?.toString();
            if (raw) selectedToolIds = JSON.parse(raw) as string[];
        } catch {
            // ignore malformed data
        }

        const now = new Date();

        await db.update(interactiveLearning)
            .set({
                description,
                status,
                publishedAt: status === 'published' ? now : undefined,
                updatedAt: now
            })
            .where(eq(interactiveLearning.id, ilid));

        await DBAgentActivityUtils.updateAgentActivity(ilid, {
            llmRole,
            llmInstructions,
            llmContext,
            systemPrompt,
            llmModel: llmModel || 'GPT-4o',
            temperature,
            maxTokens,
            topP,
            maxToolRoundtrips,
            parallelToolCalls,
            toolChoice,
            finalizationEnabled,
            finalizationToolName,
            finalizationHandler,
            finalizationConfig,
            requireFinalizationToolCall
        });

        await DBAgentActivityUtils.setActivityTools(ilid, selectedToolIds);

        await auditService.log({
            action: auditAction.ACTIVITY_UPDATED,
            userId: locals.user?.id,
            targetType: 'activity',
            targetId: ilid,
            details: { description, status, type: 'agent', courseId: cid },
            ipAddress: getClientIP(request),
            userAgent: request.headers.get('user-agent'),
            severity: 'info'
        });

        return { success: true };
    },

    updateRagSettings: async ({ request, params, locals }) => {
        const { cid, ilid } = params;
        const { agentConfig } = await requireAgentAdminContext(cid, ilid, locals);
        const formData = await request.formData();

        const ragChunkSize = parseInt(formData.get('ragChunkSize')?.toString() || '1000', 10);
        const ragChunkOverlap = parseInt(formData.get('ragChunkOverlap')?.toString() || '200', 10);
        const ragTopK = parseInt(formData.get('ragTopK')?.toString() || '5', 10);
        const ragMinScore = parseFloat(formData.get('ragMinScore')?.toString() || '0.7');
        const ragContextMaxChars = parseInt(formData.get('ragContextMaxChars')?.toString() || '6000', 10);
        const ragMergeAdjacentChunks = parseBooleanFormValue(formData.get('ragMergeAdjacentChunks'), true);
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
        if (!Number.isFinite(ragContextMaxChars) || ragContextMaxChars < MIN_RAG_CONTEXT_MAX_CHARS || ragContextMaxChars > MAX_RAG_CONTEXT_MAX_CHARS) {
            throw error(400, `ragContextMaxChars debe estar entre ${MIN_RAG_CONTEXT_MAX_CHARS} y ${MAX_RAG_CONTEXT_MAX_CHARS}.`);
        }
        if (!Number.isFinite(ragAdjacencyWindow) || ragAdjacencyWindow < MIN_RAG_ADJACENCY_WINDOW || ragAdjacencyWindow > MAX_RAG_ADJACENCY_WINDOW) {
            throw error(400, `ragAdjacencyWindow debe estar entre ${MIN_RAG_ADJACENCY_WINDOW} y ${MAX_RAG_ADJACENCY_WINDOW}.`);
        }
        if (!Number.isFinite(ragPerSourceMaxBlocks) || ragPerSourceMaxBlocks < MIN_RAG_PER_SOURCE_MAX_BLOCKS || ragPerSourceMaxBlocks > MAX_RAG_PER_SOURCE_MAX_BLOCKS) {
            throw error(400, `ragPerSourceMaxBlocks debe estar entre ${MIN_RAG_PER_SOURCE_MAX_BLOCKS} y ${MAX_RAG_PER_SOURCE_MAX_BLOCKS}.`);
        }
        if (!Number.isFinite(ragFallbackMinScore) || ragFallbackMinScore < MIN_RAG_FALLBACK_MIN_SCORE || ragFallbackMinScore > MAX_RAG_FALLBACK_MIN_SCORE) {
            throw error(400, `ragFallbackMinScore debe estar entre ${MIN_RAG_FALLBACK_MIN_SCORE} y ${MAX_RAG_FALLBACK_MIN_SCORE}.`);
        }

        const previousRagConfig = resolveRagConfig(agentConfig.ragConfig);
        const ragDocuments = await db.select({
            id: interactiveLearningRagDocument.id,
            originalPath: interactiveLearningRagDocument.originalPath,
            fileStorageId: interactiveLearningRagDocument.fileStorageId
        })
            .from(interactiveLearningRagDocument)
            .where(eq(interactiveLearningRagDocument.interactiveLearningId, ilid))
            .all();
        const ragEnabled = ragDocuments.length > 0;

        const chunkingChanged =
            previousRagConfig.chunkSize !== ragChunkSize ||
            previousRagConfig.chunkOverlap !== ragChunkOverlap;

        let reindexSummary: { totalDocuments: number; fileDocuments: number; textDocuments: number } | null = null;
        if (ragEnabled && chunkingChanged) {
            reindexSummary = {
                totalDocuments: ragDocuments.length,
                fileDocuments: ragDocuments.filter((doc) => !!doc.fileStorageId || !!doc.originalPath).length,
                textDocuments: ragDocuments.filter((doc) => !doc.fileStorageId && !doc.originalPath).length
            };
        }

        let ragCollectionName = agentConfig.ragCollectionName;
        if (ragEnabled) {
            if (!ragCollectionName) {
                ragCollectionName = `agent_${ilid.replace(/-/g, '_')}`;
            }

            const ensureResult = await ensureCollection(
                ragCollectionName,
                GEMINI_EMBEDDING_DIMENSIONS,
                'Cosine'
            );
            if (!ensureResult.success) {
                throw error(500, `Error ensuring Qdrant collection: ${ensureResult.error}`);
            }
        }

        if (!ragEnabled && agentConfig.ragCollectionName) {
            const exists = await collectionExists(agentConfig.ragCollectionName);
            if (exists) {
                await deleteCollection(agentConfig.ragCollectionName);
            }
            ragCollectionName = null;

            await db.delete(interactiveLearningRagDocument)
                .where(eq(interactiveLearningRagDocument.interactiveLearningId, ilid));
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

        await db.update(interactiveLearningAgent)
            .set({
                ragEnabled,
                ragCollectionName,
                ragConfig: JSON.stringify(ragConfig)
            })
            .where(eq(interactiveLearningAgent.id, ilid));

        return {
            success: true,
            requiresReindex: !!reindexSummary && reindexSummary.totalDocuments > 0,
            reindexSummary,
            changed: { chunkingChanged }
        };
    },

    uploadRagDocument: async ({ request, params, locals }) => {
        const { cid, ilid } = params;
        const { user, agentConfig } = await requireAgentAdminContext(cid, ilid, locals);
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) throw error(400, 'No file provided');

        const readyAgent = await ensureAgentRagReady(agentConfig);
        const uploadResult = await fileStorageService.upload({
            file,
            category: 'rag_document',
            entityType: 'interactive_learning',
            entityId: ilid,
            uploadedBy: user.id,
            displayName: file.name,
            visibility: 'private'
        });

        if (!uploadResult.success) {
            throw error(500, uploadResult.error || 'Error al subir el documento');
        }

        const now = new Date();
        const docId = nanoid();
        const ragConfig = resolveRagConfig(readyAgent.ragConfig);

        await db.insert(interactiveLearningRagDocument).values({
            id: docId,
            interactiveLearningId: ilid,
            fileStorageId: uploadResult.fileId || null,
            name: file.name,
            originalPath: `/api/files/${uploadResult.fileId}`,
            fileType: file.name.split('.').pop() || 'unknown',
            fileSize: file.size,
            status: 'processing',
            createdAt: now,
            updatedAt: now
        });

        try {
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

            const contents = doc.chunks.map((chunk) => chunk.content);
            const embeddings = await generateEmbeddings(contents);

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

            const upsertResult = await upsertPoints(readyAgent.ragCollectionName, points);
            if (!upsertResult.success) {
                throw new Error(`Failed to upsert points: ${upsertResult.error}`);
            }

            await db.update(interactiveLearningRagDocument)
                .set({
                    status: 'indexed',
                    chunkCount: doc.chunks.length,
                    totalCharacters: doc.metadata.totalCharacters,
                    qdrantPointIds: JSON.stringify(pointIds),
                    updatedAt: new Date()
                })
                .where(eq(interactiveLearningRagDocument.id, docId));

            return { success: true, documentId: docId };
        } catch (e) {
            const rawMessage = e instanceof Error ? e.message : 'Unknown error';
            const friendlyMessage = rawMessage.includes('Invalid embedding response')
                ? 'La API de embeddings devolvió una respuesta inválida. El documento puede ser demasiado grande o requerir procesamiento por lotes.'
                : rawMessage;

            await db.update(interactiveLearningRagDocument)
                .set({
                    status: 'error',
                    errorMessage: friendlyMessage,
                    updatedAt: new Date()
                })
                .where(eq(interactiveLearningRagDocument.id, docId));

            throw error(500, friendlyMessage);
        }
    },

    uploadRagText: async ({ request, params, locals }) => {
        const { cid, ilid } = params;
        const { agentConfig } = await requireAgentAdminContext(cid, ilid, locals);
        const formData = await request.formData();
        const text = formData.get('text')?.toString();
        const name = formData.get('name')?.toString() || 'Direct Input';

        if (!text) throw error(400, 'No text provided');

        const readyAgent = await ensureAgentRagReady(agentConfig);
        const now = new Date();
        const docId = nanoid();
        const ragConfig = resolveRagConfig(readyAgent.ragConfig);

        await db.insert(interactiveLearningRagDocument).values({
            id: docId,
            interactiveLearningId: ilid,
            name,
            fileType: 'txt',
            fileSize: text.length,
            status: 'processing',
            createdAt: now,
            updatedAt: now
        });

        try {
            const doc = processText(
                text,
                name,
                {
                    chunkSize: ragConfig.chunkSize,
                    chunkOverlap: ragConfig.chunkOverlap
                }
            );

            const contents = doc.chunks.map((chunk) => chunk.content);
            const embeddings = await generateEmbeddings(contents);

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

            const upsertResult = await upsertPoints(readyAgent.ragCollectionName, points);
            if (!upsertResult.success) {
                throw new Error(`Failed to upsert points: ${upsertResult.error}`);
            }

            await db.update(interactiveLearningRagDocument)
                .set({
                    status: 'indexed',
                    chunkCount: doc.chunks.length,
                    totalCharacters: doc.metadata.totalCharacters,
                    qdrantPointIds: JSON.stringify(pointIds),
                    updatedAt: new Date()
                })
                .where(eq(interactiveLearningRagDocument.id, docId));

            return { success: true, documentId: docId };
        } catch (e) {
            const rawMessage = e instanceof Error ? e.message : 'Unknown error';
            const friendlyMessage = rawMessage.includes('Invalid embedding response')
                ? 'La API de embeddings devolvió una respuesta inválida durante el indexado de texto.'
                : rawMessage;

            await db.update(interactiveLearningRagDocument)
                .set({
                    status: 'error',
                    errorMessage: friendlyMessage,
                    updatedAt: new Date()
                })
                .where(eq(interactiveLearningRagDocument.id, docId));

            throw error(500, friendlyMessage);
        }
    },

    deleteRagDocument: async ({ request, params, locals }) => {
        const { cid, ilid } = params;
        const { user, agentConfig } = await requireAgentAdminContext(cid, ilid, locals);
        const formData = await request.formData();
        const documentId = formData.get('documentId')?.toString();

        if (!documentId) throw error(400, 'No document ID provided');

        const document = await db.select()
            .from(interactiveLearningRagDocument)
            .where(eq(interactiveLearningRagDocument.id, documentId))
            .get();

        if (!document) throw error(404, 'Document not found');
        if (document.interactiveLearningId !== ilid) throw error(403, 'Document does not belong to this activity');

        if (agentConfig.ragCollectionName) {
            let pointIds: Array<string | number> = parseQdrantPointIds(document.qdrantPointIds);
            if (pointIds.length === 0) {
                pointIds = await findPointIdsByDocumentId(agentConfig.ragCollectionName, document.id);
            }
            if (pointIds.length > 0) {
                await deletePoints(agentConfig.ragCollectionName, pointIds);
            }
        }

        const storageFileId = document.fileStorageId ?? extractFileId(document.originalPath);
        if (storageFileId) {
            const deleteFileResult = await fileStorageService.delete(storageFileId, user.id);
            if (!deleteFileResult.success) {
                console.warn(`[RAG][agent] Failed to delete original file ${storageFileId}: ${deleteFileResult.error}`);
            }
        }

        await db.delete(interactiveLearningRagDocument)
            .where(eq(interactiveLearningRagDocument.id, documentId));

        const remainingDocuments = await db.select({ id: interactiveLearningRagDocument.id })
            .from(interactiveLearningRagDocument)
            .where(eq(interactiveLearningRagDocument.interactiveLearningId, ilid))
            .all();

        if (remainingDocuments.length === 0) {
            if (agentConfig.ragCollectionName) {
                const exists = await collectionExists(agentConfig.ragCollectionName);
                if (exists) {
                    await deleteCollection(agentConfig.ragCollectionName);
                }
            }

            await db.update(interactiveLearningAgent)
                .set({
                    ragCollectionName: null,
                    ragEnabled: false
                })
                .where(eq(interactiveLearningAgent.id, ilid));
        }

        return { success: true };
    },

    reindexRagDocuments: async ({ params, locals }) => {
        const { cid, ilid } = params;
        const { user, agentConfig } = await requireAgentAdminContext(cid, ilid, locals);
        const readyAgent = await ensureAgentRagReady(agentConfig);
        const ragConfig = resolveRagConfig(readyAgent.ragConfig);

        const documents = await db.select()
            .from(interactiveLearningRagDocument)
            .where(eq(interactiveLearningRagDocument.interactiveLearningId, ilid))
            .all();

        let reindexed = 0;
        let skippedNoSource = 0;
        let failed = 0;

        for (const document of documents) {
            const fileId = document.fileStorageId ?? extractFileId(document.originalPath);
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
                    previousPointIds = await findPointIdsByDocumentId(readyAgent.ragCollectionName, document.id);
                }
                if (previousPointIds.length > 0) {
                    await deletePoints(readyAgent.ragCollectionName, previousPointIds);
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

                const upsertResult = await upsertPoints(readyAgent.ragCollectionName, points);
                if (!upsertResult.success) {
                    throw new Error(`Error al insertar embeddings: ${upsertResult.error}`);
                }

                await db.update(interactiveLearningRagDocument)
                    .set({
                        status: 'indexed',
                        chunkCount: processed.chunks.length,
                        totalCharacters: processed.metadata.totalCharacters,
                        qdrantPointIds: JSON.stringify(pointIds),
                        errorMessage: null,
                        updatedAt: new Date()
                    })
                    .where(eq(interactiveLearningRagDocument.id, document.id));

                reindexed += 1;
            } catch (e) {
                failed += 1;
                await db.update(interactiveLearningRagDocument)
                    .set({
                        status: 'error',
                        errorMessage: e instanceof Error ? e.message : 'Error reindexando documento',
                        updatedAt: new Date()
                    })
                    .where(eq(interactiveLearningRagDocument.id, document.id));
            }
        }

        await auditService.log({
            action: auditAction.ACTIVITY_UPDATED,
            userId: user.id,
            targetType: 'activity',
            targetId: ilid,
            details: {
                operation: 'rag_reindex_agent',
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

    uploadFile: async ({ request, params, locals }) => {
        const { cid, ilid } = params;
        const { user } = await requireAgentAdminContext(cid, ilid, locals);
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const type = formData.get('type')?.toString() as keyof typeof fileType;

        if (!file) throw error(400, 'No file provided');
        if (!type || !fileType[type]) throw error(400, 'Invalid file type');

        const result = await fileStorageService.upload({
            file,
            category: 'chat',
            entityType: 'interactive_learning',
            entityId: ilid,
            uploadedBy: user.id,
            displayName: file.name,
            visibility: 'restricted'
        });

        if (!result.success) {
            throw error(500, result.error || 'Error al subir el archivo');
        }

        await db.insert(interactiveLearningFile).values({
            id: nanoid(),
            interactiveLearningId: ilid,
            fileStorageId: result.fileId || null,
            name: file.name,
            path: `/api/files/${result.fileId}`,
            type,
            size: file.size,
            mimeType: file.type,
            createdAt: new Date()
        });

        return { success: true };
    },

    deleteFile: async ({ request, params, locals }) => {
        const { cid, ilid } = params;
        const { user } = await requireAgentAdminContext(cid, ilid, locals);
        const formData = await request.formData();
        const fileId = formData.get('fileId')?.toString();

        if (!fileId) throw error(400, 'No file ID provided');

        const fileRecord = await db.select()
            .from(interactiveLearningFile)
            .where(eq(interactiveLearningFile.id, fileId))
            .get();

        if (!fileRecord) throw error(404, 'File not found');
        if (fileRecord.interactiveLearningId !== ilid) throw error(403, 'File does not belong to this activity');

        const storageFileId = fileRecord.fileStorageId ?? extractFileId(fileRecord.path);
        if (!storageFileId) {
            throw error(400, 'Invalid file path');
        }

        const deleteStorageResult = await fileStorageService.delete(storageFileId, user.id);
        if (!deleteStorageResult.success) {
            throw error(500, deleteStorageResult.error || 'Error deleting file from storage');
        }

        await db.delete(interactiveLearningFile)
            .where(eq(interactiveLearningFile.id, fileId));

        return { success: true };
    }
} satisfies Actions;
