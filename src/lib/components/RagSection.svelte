<script lang="ts">
    import { untrack, onDestroy } from 'svelte';
    import { Toggle, Button, Alert, Badge, Spinner, Accordion, AccordionItem, Textarea } from 'flowbite-svelte';
    import { Database, Upload, FileText, Trash2, Settings, AlertCircle, CheckCircle2, Info, Layers, ExternalLink, Cpu, RefreshCw } from 'lucide-svelte';
    import { enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';

    interface RagDocument {
        id: string;
        name: string;
        originalPath?: string | null;
        fileType: string;
        fileSize: number | null;
        chunkCount: number | null;
        totalCharacters: number | null;
        status: string;
        errorMessage: string | null;
        createdAt: Date | string;
    }

    interface RagTechnicalInfo {
        embeddingModel: string;
        embeddingProvider: string;
        embeddingDimensions: number;
        collectionName: string | null;
        indexedDocuments: number;
        processingDocuments: number;
        errorDocuments: number;
        orphanVectorsRemoved: number;
        pointCount: number;
    }

    interface Props {
        ragChunkSize?: number;
        ragChunkOverlap?: number;
        ragTopK?: number;
        ragMinScore?: number;
        ragContextMaxChars?: number;
        ragMergeAdjacentChunks?: boolean;
        ragAdjacencyWindow?: number;
        ragPerSourceMaxBlocks?: number;
        ragFallbackMinScore?: number;
        ragDocuments?: RagDocument[];
        ragUploadMaxBytes?: number;
        qdrantConnected?: boolean;
        ragCollectionInfo?: { pointCount: number } | null;
        ragTechnicalInfo?: RagTechnicalInfo | null;
    }

    let {
        ragChunkSize = 6000,
        ragChunkOverlap = 200,
        ragTopK = 5,
        ragMinScore = 0.6,
        ragContextMaxChars = 6000,
        ragMergeAdjacentChunks = true,
        ragAdjacencyWindow = 0,
        ragPerSourceMaxBlocks = 3,
        ragFallbackMinScore = 0.45,
        ragDocuments = [],
        ragUploadMaxBytes = 50 * 1024 * 1024,
        qdrantConnected = false,
        ragCollectionInfo = null,
        ragTechnicalInfo = null
    }: Props = $props();

    let chunkSize = $state(untrack(() => ragChunkSize));
    let chunkOverlap = $state(untrack(() => ragChunkOverlap));
    let topK = $state(untrack(() => ragTopK));
    let minScore = $state(untrack(() => ragMinScore));
    let contextMaxChars = $state(untrack(() => ragContextMaxChars));
    let mergeAdjacentChunks = $state(untrack(() => ragMergeAdjacentChunks));
    let adjacencyWindow = $state(untrack(() => ragAdjacencyWindow));
    let perSourceMaxBlocks = $state(untrack(() => ragPerSourceMaxBlocks));
    let fallbackMinScore = $state(untrack(() => ragFallbackMinScore));

    let isUploading = $state(false);
    let isProcessingText = $state(false);
    let showTextInput = $state(false);
    let directTextName = $state('');
    let directTextContent = $state('');
    let savingSettings = $state(false);
    let showAdvancedSettings = $state(false);
    let showTechnicalInfo = $state(false);
    let deletingDocumentId = $state<string | null>(null);
    let isReindexing = $state(false);

    let operationMessage = $state('');
    let operationError = $state('');
    let waitingDocumentIndexing = $state(false);
    let reindexNotice = $state('');
    let reindexSummary = $state<{ total: number; reindexed: number; skippedNoSource: number; failed: number } | null>(null);
    let lastSavedChunkSize = $state(untrack(() => ragChunkSize));
    let lastSavedChunkOverlap = $state(untrack(() => ragChunkOverlap));
    const erroredDocuments = $derived(
        ragDocuments.filter((doc) => doc.status === 'error' && !!doc.errorMessage)
    );
    const requiresReindexPreview = $derived(
        ragDocuments.length > 0 &&
        (chunkSize !== lastSavedChunkSize || chunkOverlap !== lastSavedChunkOverlap)
    );
    const invalidChunkConfig = $derived(chunkOverlap >= chunkSize);
    const hasReindexableDocuments = $derived(
        ragDocuments.some((doc) => !!doc.originalPath)
    );
    const ragIsActive = $derived(ragDocuments.length > 0);
    const indexedDocumentsCount = $derived(ragDocuments.filter((doc) => doc.status === 'indexed').length);
    const processingDocumentsCount = $derived(ragDocuments.filter((doc) => doc.status === 'processing').length);
    const errorDocumentsCount = $derived(ragDocuments.filter((doc) => doc.status === 'error').length);
    const ragUploadMaxMb = $derived(Math.max(1, Math.round(ragUploadMaxBytes / (1024 * 1024))));

    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    $effect(() => {
        const processing = ragDocuments.some((d) => d.status === 'processing');
        if (processing && !refreshTimer) refreshTimer = setInterval(() => invalidateAll(), 4000);
        if (!processing && refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    });
    $effect(() => {
        const processing = ragDocuments.some((d) => d.status === 'processing');
        if (waitingDocumentIndexing && !processing && !isUploading) {
            if (!operationError) {
                operationMessage = 'Documento indexado correctamente.';
            }
            waitingDocumentIndexing = false;
        }
    });
    onDestroy(() => { if (refreshTimer) clearInterval(refreshTimer); });

    async function readResponseError(response: Response): Promise<string> {
        const raw = await response.text();
        if (!raw) return `Error (${response.status})`;
        try {
            const parsed = JSON.parse(raw);
            return parsed?.error?.message || parsed?.message || raw;
        } catch {
            if (raw.includes('<!doctype html') || raw.includes('<html')) {
                return `Error del servidor (${response.status}). Revisa el listado de documentos para más detalle.`;
            }
            return raw;
        }
    }

    async function uploadDocument(file: File) {
        operationError = '';
        operationMessage = `Subiendo "${file.name}"...`;
        waitingDocumentIndexing = false;
        isUploading = true;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch('?/uploadRagDocument', { method: 'POST', body: formData });
            if (!response.ok) { operationError = await readResponseError(response); operationMessage = ''; waitingDocumentIndexing = false; return; }
            operationMessage = `Documento "${file.name}" recibido. Procesando embeddings...`;
            waitingDocumentIndexing = true;
            await invalidateAll();
        } catch (e) {
            operationError = e instanceof Error ? e.message : 'Error inesperado al subir el documento.';
            operationMessage = '';
            waitingDocumentIndexing = false;
        } finally { isUploading = false; }
    }

    async function handleFileUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.doc,.docx,.txt';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) await uploadDocument(file);
        };
        input.click();
    }

    async function handleTextUpload() {
        if (!directTextContent.trim()) return;
        operationError = '';
        operationMessage = 'Indexando texto...';
        isProcessingText = true;
        const formData = new FormData();
        formData.append('text', directTextContent);
        formData.append('name', directTextName || 'Texto directo');
        try {
            const response = await fetch('?/uploadRagText', { method: 'POST', body: formData });
            if (!response.ok) { operationError = await readResponseError(response); operationMessage = ''; return; }
            directTextContent = '';
            directTextName = '';
            showTextInput = false;
            operationMessage = 'Texto indexado y enviado a Qdrant.';
            await invalidateAll();
        } catch (e) {
            operationError = e instanceof Error ? e.message : 'Error inesperado al indexar el texto.';
            operationMessage = '';
        } finally { isProcessingText = false; }
    }

    async function handleDeleteDocument(documentId: string) {
        const documentToDelete = ragDocuments.find((doc) => doc.id === documentId);
        const documentLabel = documentToDelete?.name ? `"${documentToDelete.name}"` : 'este documento';
        const shouldDelete = window.confirm(`¿Seguro que deseas eliminar ${documentLabel}? Esta acción no se puede deshacer.`);
        if (!shouldDelete) return;

        deletingDocumentId = documentId;
        operationError = '';
        operationMessage = 'Eliminando documento y embeddings...';
        const formData = new FormData();
        formData.append('documentId', documentId);
        try {
            const response = await fetch('?/deleteRagDocument', { method: 'POST', body: formData });
            if (!response.ok) { operationError = await readResponseError(response); operationMessage = ''; return; }
            operationMessage = 'Documento eliminado.';
            await invalidateAll();
        } catch (e) {
            operationError = e instanceof Error ? e.message : 'Error inesperado al eliminar el documento.';
            operationMessage = '';
        } finally { deletingDocumentId = null; }
    }

    async function handleReindexDocuments() {
        operationError = '';
        operationMessage = 'Reindexando documentos...';
        isReindexing = true;

        try {
            const formData = new FormData();
            formData.append('reindex', 'true');
            const response = await fetch('?/reindexRagDocuments', { method: 'POST', body: formData });
            if (!response.ok) {
                operationError = await readResponseError(response);
                operationMessage = '';
                return;
            }

            const raw = await response.text();
            let parsed: unknown = null;
            try {
                parsed = raw ? JSON.parse(raw) : null;
            } catch {
                parsed = null;
            }

            const actionData = typeof parsed === 'object' && parsed !== null && 'data' in parsed
                ? (parsed as { data?: { summary?: { total: number; reindexed: number; skippedNoSource: number; failed: number } } }).data
                : null;

            const summary = actionData?.summary ?? null;
            reindexSummary = summary;

            if (summary) {
                operationMessage = `Reindexado completado: ${summary.reindexed}/${summary.total} documentos reindexados, ${summary.skippedNoSource} sin fuente, ${summary.failed} con error.`;
            } else {
                operationMessage = 'Reindexado completado.';
            }

            reindexNotice = '';
            await invalidateAll();
        } catch (e) {
            operationError = e instanceof Error ? e.message : 'Error inesperado reindexando documentos.';
            operationMessage = '';
        } finally {
            isReindexing = false;
        }
    }

    function formatBytes(bytes: number | null): string {
        if (!bytes) return '0 B';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function getStatusBadgeColor(status: string): 'green' | 'yellow' | 'red' | 'blue' {
        if (status === 'indexed') return 'green';
        if (status === 'processing') return 'yellow';
        if (status === 'error') return 'red';
        return 'blue';
    }

    const handleSettingsEnhance = () => {
        savingSettings = true;
        return async ({ result }: { result: { type: string; data?: { requiresReindex?: boolean; reindexSummary?: { totalDocuments: number; fileDocuments: number; textDocuments: number } } } }) => {
            savingSettings = false;
            if (result.type === 'success') {
                lastSavedChunkSize = chunkSize;
                lastSavedChunkOverlap = chunkOverlap;
                const data = result.data;
                if (data?.requiresReindex && data.reindexSummary) {
                    reindexNotice = `Configuración guardada. Debes reindexar ${data.reindexSummary.totalDocuments} documento(s) para aplicar chunk size/overlap nuevos.`;
                } else {
                    reindexNotice = '';
                    operationMessage = 'Configuración avanzada guardada.';
                }
                await invalidateAll();
            }
        };
    };
</script>

<div class="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-6 shadow-sm dark:border-emerald-900 dark:from-slate-900 dark:via-slate-900 dark:to-gray-900">
    <div class="mb-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
            <div class="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-950"><Database class="h-6 w-6 text-emerald-700 dark:text-emerald-300" /></div>
            <div>
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">Biblioteca de apoyo para el chat</h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">Sube materiales y el asistente responderá usando tu propio contenido.</p>
            </div>
        </div>
        <Badge color={qdrantConnected ? 'green' : 'red'} class="gap-1">{#if qdrantConnected}<CheckCircle2 class="h-3 w-3" />Servicio disponible{:else}<AlertCircle class="h-3 w-3" />Servicio no disponible{/if}</Badge>
    </div>

    {#if !qdrantConnected}
        <Alert color="red"><span class="font-medium">No se puede procesar la biblioteca ahora.</span> Revisa la conexión del servicio vectorial.</Alert>
    {:else}
        <div class="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-xl border border-emerald-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Estado</p>
                <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{ragIsActive ? 'Activa' : 'Vacía'}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">{ragIsActive ? 'Hay material disponible para responder.' : 'Sube un documento para empezar.'}</p>
            </div>
            <div class="rounded-xl border border-emerald-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Materiales</p>
                <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{ragDocuments.length}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">Documentos cargados en esta actividad.</p>
            </div>
            <div class="rounded-xl border border-emerald-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Listos</p>
                <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{indexedDocumentsCount}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">Documentos que ya usa el chat.</p>
            </div>
            <div class="rounded-xl border border-emerald-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">En proceso / Error</p>
                <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{processingDocumentsCount} / {errorDocumentsCount}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">Revisa abajo si hay incidencias.</p>
            </div>
        </div>

        <form method="POST" action="?/updateRagSettings" use:enhance={handleSettingsEnhance}>
            <div class="mb-4 flex items-center gap-4 rounded-xl border border-emerald-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <input type="hidden" name="ragEnabled" value={ragIsActive ? 'true' : 'false'} />
                <input type="hidden" name="ragMergeAdjacentChunks" value={mergeAdjacentChunks ? 'true' : 'false'} />
                <div class="flex-1">
                    <p class="font-semibold text-gray-900 dark:text-white">Material de clase</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        La biblioteca se activa automáticamente al subir documentos. Si eliminas todos, se limpia y se desactiva sola.
                    </p>
                </div>
                <Badge color={ragIsActive ? 'green' : 'gray'}>
                    {ragIsActive ? 'Biblioteca activa' : 'Sin materiales'}
                </Badge>
                {#if ragIsActive && ragCollectionInfo}<Badge color="blue"><Layers class="mr-1 h-3 w-3" />{ragCollectionInfo.pointCount} fragmentos</Badge>{/if}
            </div>

            <Accordion class="mb-4">
                <AccordionItem bind:open={showAdvancedSettings}>
                    {#snippet header()}
                            <div class="flex items-center gap-2">
                                <Settings class="h-4 w-4" />
                                <span>Ajustes de recuperación (opcional)</span>
                            </div>
                    {/snippet}

                    <div class="space-y-4 p-4">
                        <p class="text-sm text-slate-600 dark:text-slate-300">
                            Aquí defines cómo se fragmentan los documentos (tamaño y solape) y cómo se recupera el contexto para responder.
                        </p>
                        {#if requiresReindexPreview}
                            <Alert color="yellow">
                                Cambiaste <strong>chunk size/overlap</strong>. Al guardar tendrás que reindexar los documentos existentes para aplicar estos valores.
                            </Alert>
                        {/if}
                        {#if invalidChunkConfig}
                            <Alert color="red">
                                El overlap debe ser menor que el tamaño de chunk.
                            </Alert>
                        {/if}
                            {#if !ragIsActive}
                                <Alert color="blue">
                                    Puedes dejar estos ajustes preparados ahora. Se aplicarán al subir el primer documento.
                                </Alert>
                            {/if}

                        <div class="grid gap-4 md:grid-cols-2">
                            <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                                <div class="mb-2 flex items-center justify-between">
                                    <label for="ragChunkSize" class="text-sm font-semibold">Tamaño de Chunk</label>
                                    <span class="text-xs font-mono text-slate-600 dark:text-slate-300">{chunkSize}</span>
                                </div>
                                <input type="range" id="ragChunkSize" name="ragChunkSize" bind:value={chunkSize} min="100" max="12000" step="100" class="w-full" />
                                <p class="mt-1 text-xs text-slate-500">Más grande: menos chunks, menos precisión local. Más pequeño: más granularidad.</p>
                            </div>

                                <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                                    <div class="mb-2 flex items-center justify-between">
                                        <label for="ragChunkOverlap" class="text-sm font-semibold">Overlap entre Chunks</label>
                                        <span class="text-xs font-mono text-slate-600 dark:text-slate-300">{chunkOverlap}</span>
                                    </div>
                                    <input type="range" id="ragChunkOverlap" name="ragChunkOverlap" bind:value={chunkOverlap} min="0" max="4000" step="50" class="w-full" />
                                    <p class="mt-1 text-xs text-slate-500">Ayuda a no perder contexto al cortar el texto.</p>
                                </div>

                                <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                                    <div class="mb-2 flex items-center justify-between">
                                        <label for="ragTopK" class="text-sm font-semibold">Top K de Recuperación</label>
                                        <span class="text-xs font-mono text-slate-600 dark:text-slate-300">{topK}</span>
                                    </div>
                                    <input type="range" id="ragTopK" name="ragTopK" bind:value={topK} min="1" max="20" step="1" class="w-full" />
                                    <p class="mt-1 text-xs text-slate-500">Cuántos fragmentos se usan como contexto por pregunta.</p>
                                </div>

                                <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                                    <div class="mb-2 flex items-center justify-between">
                                        <label for="ragMinScore" class="text-sm font-semibold">Score mínimo</label>
                                        <span class="text-xs font-mono text-slate-600 dark:text-slate-300">{minScore.toFixed(2)}</span>
                                    </div>
                                    <input type="range" id="ragMinScore" name="ragMinScore" bind:value={minScore} min="0" max="1" step="0.05" class="w-full" />
                                    <p class="mt-1 text-xs text-slate-500">Filtra resultados poco relevantes.</p>
                                </div>

                                <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                                    <div class="mb-2 flex items-center justify-between">
                                        <label for="ragContextMaxChars" class="text-sm font-semibold">Máx. caracteres de contexto</label>
                                        <span class="text-xs font-mono text-slate-600 dark:text-slate-300">{contextMaxChars}</span>
                                    </div>
                                    <input type="range" id="ragContextMaxChars" name="ragContextMaxChars" bind:value={contextMaxChars} min="500" max="24000" step="250" class="w-full" />
                                    <p class="mt-1 text-xs text-slate-500">Presupuesto total de contexto RAG que entra al system prompt.</p>
                                </div>

                                <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                                    <div class="mb-2 flex items-center justify-between">
                                        <label for="ragAdjacencyWindow" class="text-sm font-semibold">Ventana de adyacencia</label>
                                        <span class="text-xs font-mono text-slate-600 dark:text-slate-300">{adjacencyWindow}</span>
                                    </div>
                                    <input type="range" id="ragAdjacencyWindow" name="ragAdjacencyWindow" bind:value={adjacencyWindow} min="0" max="10" step="1" class="w-full" />
                                    <p class="mt-1 text-xs text-slate-500">Permite fusionar chunks cercanos del mismo documento.</p>
                                </div>

                                <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                                    <div class="mb-2 flex items-center justify-between">
                                        <label for="ragPerSourceMaxBlocks" class="text-sm font-semibold">Bloques máximos por fuente</label>
                                        <span class="text-xs font-mono text-slate-600 dark:text-slate-300">{perSourceMaxBlocks}</span>
                                    </div>
                                    <input type="range" id="ragPerSourceMaxBlocks" name="ragPerSourceMaxBlocks" bind:value={perSourceMaxBlocks} min="1" max="10" step="1" class="w-full" />
                                    <p class="mt-1 text-xs text-slate-500">Limita cuántos bloques por documento entran al contexto final.</p>
                                </div>

                                <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                                    <div class="mb-2 flex items-center justify-between">
                                        <label for="ragFallbackMinScore" class="text-sm font-semibold">Score fallback top-1</label>
                                        <span class="text-xs font-mono text-slate-600 dark:text-slate-300">{fallbackMinScore.toFixed(2)}</span>
                                    </div>
                                    <input type="range" id="ragFallbackMinScore" name="ragFallbackMinScore" bind:value={fallbackMinScore} min="0" max="1" step="0.05" class="w-full" />
                                    <p class="mt-1 text-xs text-slate-500">Si no hay chunks sobre score mínimo, permite fallback controlado.</p>
                                </div>
                        </div>

                        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-sm font-semibold">Fusionar chunks adyacentes</p>
                                    <p class="text-xs text-slate-500">Combina fragmentos consecutivos de una misma fuente en un solo bloque.</p>
                                </div>
                                <Toggle bind:checked={mergeAdjacentChunks} name="ragMergeAdjacentChunks" />
                            </div>
                        </div>

                        <div class="flex justify-end">
                            <Button type="submit" color="blue" size="sm" disabled={savingSettings || invalidChunkConfig}>
                                {#if savingSettings}<Spinner size="4" class="mr-2" />{/if}
                                Guardar ajustes
                            </Button>
                        </div>
                    </div>
                </AccordionItem>
            </Accordion>
        </form>

        <div class="mb-3 flex items-center justify-between gap-2">
            <h3 class="font-semibold text-gray-900 dark:text-white">Fuentes cargadas</h3>
            <div class="flex gap-2"><Button color="blue" size="sm" onclick={handleFileUpload} disabled={isUploading}>{#if isUploading}<Spinner size="4" class="mr-2" />{:else}<Upload class="mr-2 h-4 w-4" />{/if}Subir archivo</Button><Button color="blue" size="sm" outline onclick={() => showTextInput = !showTextInput}><FileText class="mr-2 h-4 w-4" />Pegar texto</Button><Button color="alternative" size="sm" onclick={() => invalidateAll()}><RefreshCw class="mr-2 h-4 w-4" />Actualizar</Button></div>
        </div>
        <p class="mb-3 text-xs text-amber-700 dark:text-amber-300">
            Tamaño máximo por archivo: {ragUploadMaxMb}MB (según configuración del sistema).
        </p>

        {#if operationError}<Alert color="red">{operationError}</Alert>{/if}
        {#if reindexNotice}
            <Alert color="yellow">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <span>{reindexNotice}</span>
                    <Button
                        type="button"
                        color="blue"
                        size="xs"
                        onclick={handleReindexDocuments}
                        disabled={isReindexing || !hasReindexableDocuments}
                    >
                        {#if isReindexing}<Spinner size="4" class="mr-2" />{/if}
                        Reindexar documentos
                    </Button>
                </div>
            </Alert>
        {/if}
        {#if reindexSummary}
            <Alert color="blue">
                Resumen de reindexado: {reindexSummary.reindexed}/{reindexSummary.total} reindexados, {reindexSummary.skippedNoSource} sin fuente original, {reindexSummary.failed} con error.
            </Alert>
        {/if}
        {#if erroredDocuments.length > 0}
            <Alert color="red">
                <div class="text-sm">
                    <p class="font-semibold">Hay documentos con error de indexación.</p>
                    {#each erroredDocuments as failedDoc (failedDoc.id)}
                        <p class="mt-1">
                            <strong>{failedDoc.name}:</strong> {failedDoc.errorMessage}
                        </p>
                    {/each}
                </div>
            </Alert>
        {/if}
        {#if operationMessage}<Alert color="blue">{#if isUploading || isProcessingText}<Spinner size="4" class="mr-2" />{/if}{operationMessage}</Alert>{/if}

        {#if showTextInput}
            <div class="mb-5 rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-4 dark:border-cyan-900 dark:from-slate-800 dark:to-slate-800">
                <div class="mb-3">
                    <p class="font-semibold text-gray-900 dark:text-white">Nuevo texto para la biblioteca</p>
                    <p class="text-xs text-gray-600 dark:text-gray-300">Ideal para instrucciones, rúbricas, criterios o resúmenes breves.</p>
                </div>

                <div class="space-y-3">
                    <div>
                        <label for="ragDirectTextName" class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Título del material</label>
                        <input
                            id="ragDirectTextName"
                            type="text"
                            bind:value={directTextName}
                            placeholder="Ejemplo: Rúbrica Tema 2"
                            class="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                    </div>

                    <div>
                        <label for="ragDirectTextContent" class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Contenido</label>
                        <Textarea
                            id="ragDirectTextContent"
                            bind:value={directTextContent}
                            rows={10}
                            class="w-full resize-y rounded-lg border border-gray-300 bg-white text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                            placeholder="Pega aquí el texto que quieres que el asistente utilice..."
                        />
                        <div class="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                            <span>Cuanto más claro sea el texto, mejores respuestas tendrás.</span>
                            <span>{directTextContent.trim().length} caracteres</span>
                        </div>
                    </div>
                </div>

                <div class="mt-3 flex justify-end gap-2">
                    <Button color="alternative" size="sm" onclick={() => showTextInput = false}>Cancelar</Button>
                    <Button color="blue" size="sm" onclick={handleTextUpload} disabled={isProcessingText || !directTextContent.trim()}>
                        {#if isProcessingText}<Spinner size="4" class="mr-2" />{/if}
                        Indexar texto
                    </Button>
                </div>
            </div>
        {/if}

        <div class="space-y-2">
            {#if ragDocuments.length === 0}
                <div class="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center dark:border-gray-600">Aún no hay materiales. Sube el primero para activar la biblioteca automáticamente.</div>
            {:else}
                {#each ragDocuments as doc (doc.id)}
                    <div class="rounded-lg border bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <div class="min-w-0"><p class="truncate font-medium dark:text-white">{doc.name}</p><p class="text-xs text-gray-500 dark:text-gray-400">{doc.fileType.toUpperCase()} - {formatBytes(doc.fileSize)} - {doc.chunkCount ?? 0} fragmentos</p></div>
                            <div class="flex items-center gap-2"><Badge color={getStatusBadgeColor(doc.status)}>{doc.status === 'indexed' ? 'Listo' : doc.status === 'processing' ? 'Procesando' : doc.status === 'error' ? 'Error' : doc.status}</Badge>{#if doc.originalPath}<a href={doc.originalPath} target="_blank" rel="noreferrer" class="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><ExternalLink class="h-3 w-3" />Abrir</a>{/if}<button type="button" class="text-red-500 hover:text-red-700 disabled:opacity-50" onclick={() => handleDeleteDocument(doc.id)} disabled={deletingDocumentId === doc.id}>{#if deletingDocumentId === doc.id}<Spinner size="4" />{:else}<Trash2 class="h-5 w-5" />{/if}</button></div>
                        </div>
                        {#if doc.status === 'error' && doc.errorMessage}<p class="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{doc.errorMessage}</p>{/if}
                    </div>
                {/each}
            {/if}
        </div>

        <Accordion class="mt-4"><AccordionItem bind:open={showTechnicalInfo}>{#snippet header()}<div class="flex items-center gap-2"><Cpu class="h-4 w-4" /><span>Información técnica (avanzado)</span></div>{/snippet}
            {#if ragTechnicalInfo}<div class="grid gap-2 p-3 text-sm md:grid-cols-2"><p><strong>Modelo:</strong> {ragTechnicalInfo.embeddingModel}</p><p><strong>Proveedor:</strong> {ragTechnicalInfo.embeddingProvider}</p><p><strong>Dimensiones:</strong> {ragTechnicalInfo.embeddingDimensions}</p><p><strong>Colección:</strong> {ragTechnicalInfo.collectionName || 'N/A'}</p><p><strong>Puntos:</strong> {ragTechnicalInfo.pointCount}</p><p><strong>Indexados:</strong> {ragTechnicalInfo.indexedDocuments}</p><p><strong>Procesando:</strong> {ragTechnicalInfo.processingDocuments}</p><p><strong>Errores:</strong> {ragTechnicalInfo.errorDocuments}</p><p><strong>Huérfanos limpiados:</strong> {ragTechnicalInfo.orphanVectorsRemoved}</p></div>{/if}
        </AccordionItem></Accordion>

        <Alert color="blue" class="mt-4">{#snippet icon()}<Info class="h-4 w-4" />{/snippet}<span class="font-medium">Qué hace esta biblioteca</span><p class="mt-1 text-sm">El sistema divide tus materiales en fragmentos, crea embeddings y recupera contexto relevante para responder mejor.</p></Alert>
    {/if}
</div>
