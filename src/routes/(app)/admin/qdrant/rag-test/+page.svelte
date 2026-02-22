<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { 
        Button, 
        Card, 
        Badge, 
        Spinner, 
        Label, 
        Input, 
        Textarea,
        Select,
        Alert,
        Accordion,
        AccordionItem,
        Tabs,
        TabItem,
        Range,
        Table,
        TableHead,
        TableHeadCell,
        TableBody,
        TableBodyRow,
        TableBodyCell,
        Fileupload,
        Modal
    } from 'flowbite-svelte';
    import { marked } from 'marked';
    import { 
        Upload, 
        FileText, 
        Search, 
        MessageSquare, 
        Database,
        Trash2,
        RefreshCw,
        Send,
        Sparkles,
        Layers,
        Info,
        Bot,
        Zap
    } from 'lucide-svelte';

    // Estado general
    let loading = $state(true);
    let error = $state<string | null>(null);
    let status = $state<{
        embeddingModel: { model: string; dimensions: number; provider: string };
        collection: string;
        collectionExists: boolean;
        documentCount: number;
    } | null>(null);

    // Tab activa
    let activeTab = $state('upload');

    // Upload de documentos
    let uploadFiles = $state<FileList | null>(null);
    let directText = $state('');
    let sourceName = $state('');
    let chunkSize = $state(1000);
    let chunkOverlap = $state(200);
    let uploading = $state(false);
    let uploadResult = $state<{
        filename: string;
        fileType: string;
        totalCharacters: number;
        totalChunks: number;
        chunks: Array<{ id: string; content: string; embeddingPreview: number[] }>;
    } | null>(null);

    // Test de embeddings
    let embeddingTestText = $state('');
    let testingEmbedding = $state(false);
    let embeddingResult = $state<{
        text: string;
        dimensions: number;
        embedding: number[];
        model: { model: string; dimensions: number; provider: string };
    } | null>(null);

    // Búsqueda
    let searchQuery = $state('');
    let searchLimit = $state(5);
    let searching = $state(false);
    let searchResults = $state<Array<{
        id: string | number;
        score?: number;
        payload?: Record<string, unknown>;
    }>>([]);

    // Documentos cargados
    let documents = $state<Array<{
        id: string | number;
        payload?: Record<string, unknown>;
    }>>([]);
    let loadingDocuments = $state(false);

    // Chat RAG
    let chatMessages = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
    let chatInput = $state('');
    let chatLoading = $state(false);
    let selectedModel = $state('google/gemini-2.5-flash');
    let chatContainer: HTMLDivElement | null = $state(null);

    // Modal de chunk expandido
    let showChunkModal = $state(false);
    let selectedChunk = $state<{ content: string; score?: number; source?: string } | null>(null);

    const availableModels = [
        { value: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        { value: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { value: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
        { value: 'openai/gpt-5', name: 'GPT-5' },
        { value: 'openai/gpt-5-mini', name: 'GPT-5 Mini' }
    ];

    async function fetchStatus() {
        loading = true;
        error = null;
        
        try {
            const response = await fetch('/api/admin/qdrant/rag-test?action=status');
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Error al obtener estado');
            }
            
            status = data;
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error desconocido';
        } finally {
            loading = false;
        }
    }

    async function fetchDocuments() {
        loadingDocuments = true;
        try {
            const response = await fetch('/api/admin/qdrant/rag-test?action=documents');
            const data = await response.json();
            
            if (data.success) {
                documents = data.documents || [];
            }
        } catch (e) {
            console.error('Error loading documents:', e);
        } finally {
            loadingDocuments = false;
        }
    }

    async function uploadDocument() {
        if (!uploadFiles || uploadFiles.length === 0) {
            error = 'Por favor selecciona un archivo';
            return;
        }
        
        uploading = true;
        error = null;
        uploadResult = null;
        
        try {
            const formData = new FormData();
            formData.append('action', 'upload-document');
            formData.append('file', uploadFiles[0]);
            formData.append('chunkSize', chunkSize.toString());
            formData.append('chunkOverlap', chunkOverlap.toString());
            
            const response = await fetch('/api/admin/qdrant/rag-test', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Error al subir documento');
            }
            
            uploadResult = data.document ? {
                ...data.document,
                chunks: data.chunks || []
            } : null;
            
            // Refresh status and documents
            await fetchStatus();
            await fetchDocuments();
            
            // Clear file input
            uploadFiles = null;
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error al subir documento';
        } finally {
            uploading = false;
        }
    }

    async function uploadText() {
        if (!directText.trim()) {
            error = 'Por favor ingresa texto';
            return;
        }
        
        uploading = true;
        error = null;
        uploadResult = null;
        
        try {
            const response = await fetch('/api/admin/qdrant/rag-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'upload-text',
                    text: directText,
                    sourceName: sourceName || 'direct-input',
                    chunkSize,
                    chunkOverlap
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Error al subir texto');
            }
            
            uploadResult = data.document ? {
                ...data.document,
                chunks: data.chunks || []
            } : null;
            
            // Refresh status and documents
            await fetchStatus();
            await fetchDocuments();
            
            // Clear inputs
            directText = '';
            sourceName = '';
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error al subir texto';
        } finally {
            uploading = false;
        }
    }

    async function testEmbedding() {
        if (!embeddingTestText.trim()) {
            error = 'Por favor ingresa texto para probar';
            return;
        }
        
        testingEmbedding = true;
        error = null;
        embeddingResult = null;
        
        try {
            const response = await fetch('/api/admin/qdrant/rag-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'test-embedding',
                    text: embeddingTestText
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Error al generar embedding');
            }
            
            embeddingResult = data;
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error al generar embedding';
        } finally {
            testingEmbedding = false;
        }
    }

    async function performSearch() {
        if (!searchQuery.trim()) {
            error = 'Por favor ingresa una consulta de búsqueda';
            return;
        }
        
        searching = true;
        error = null;
        searchResults = [];
        
        try {
            const response = await fetch('/api/admin/qdrant/rag-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'search',
                    query: searchQuery,
                    limit: searchLimit
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Error en búsqueda');
            }
            
            searchResults = data.results || [];
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error en búsqueda';
        } finally {
            searching = false;
        }
    }

    async function clearCollection() {
        if (!confirm('¿Estás seguro de que deseas eliminar todos los documentos? Esta acción no se puede deshacer.')) {
            return;
        }
        
        try {
            const response = await fetch('/api/admin/qdrant/rag-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clear-collection' })
            });
            
            await response.json();
            
            // Refresh
            await fetchStatus();
            await fetchDocuments();
            searchResults = [];
            uploadResult = null;
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error al limpiar colección';
        }
    }

    async function sendChatMessage() {
        if (!chatInput.trim()) return;
        
        const userMessage = chatInput.trim();
        chatInput = '';
        
        // Add user message
        chatMessages = [...chatMessages, { role: 'user', content: userMessage }];
        chatLoading = true;
        
        // Scroll to bottom
        await tick();
        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        try {
            const response = await fetch('/api/admin/qdrant/rag-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'chat',
                    messages: chatMessages,
                    model: selectedModel
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Error en la respuesta del chat');
            }
            
            // Handle streaming response
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let assistantMessage = '';
            
            // Add empty assistant message
            chatMessages = [...chatMessages, { role: 'assistant', content: '' }];
            
            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value, { stream: true });
                    
                    // The AI SDK text stream sends plain text chunks
                    // Just append the chunk directly
                    assistantMessage += chunk;
                    chatMessages[chatMessages.length - 1].content = assistantMessage;
                    chatMessages = chatMessages;
                    
                    // Auto scroll
                    await tick();
                    if (chatContainer) {
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    }
                }
            }
            
            // If no content received, show error
            if (!assistantMessage.trim()) {
                chatMessages[chatMessages.length - 1].content = 'No se recibió respuesta del servidor.';
                chatMessages = chatMessages;
            }
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error en el chat';
            // Remove the empty assistant message if there was an error
            if (chatMessages[chatMessages.length - 1]?.role === 'assistant' && 
                chatMessages[chatMessages.length - 1]?.content === '') {
                chatMessages = chatMessages.slice(0, -1);
            }
        } finally {
            chatLoading = false;
        }
    }

    function clearChat() {
        chatMessages = [];
    }

    function showChunkDetails(chunk: { content: string; score?: number; source?: string }) {
        selectedChunk = chunk;
        showChunkModal = true;
    }

    function handleChatKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendChatMessage();
        }
    }

    onMount(() => {
        fetchStatus();
        fetchDocuments();
    });
</script>

<div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">RAG Test Lab</h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Prueba embeddings y RAG con Qdrant + Gemini Embeddings
            </p>
        </div>
        <div class="flex gap-2">
            <Button color="alternative" onclick={fetchStatus} disabled={loading}>
                <RefreshCw class="mr-2 h-4 w-4 {loading ? 'animate-spin' : ''}" />
                Actualizar
            </Button>
            {#if status?.documentCount && status.documentCount > 0}
                <Button color="red" outline onclick={clearCollection}>
                    <Trash2 class="mr-2 h-4 w-4" />
                    Limpiar Todo
                </Button>
            {/if}
        </div>
    </div>

    <!-- Error Alert -->
    {#if error}
        <Alert color="red" dismissable onclose={() => error = null}>
            <span class="font-medium">Error:</span> {error}
        </Alert>
    {/if}

    <!-- Status Cards -->
    <div class="grid gap-4 md:grid-cols-3">
        <!-- Embedding Model -->
        <Card class="p-4">
            <div class="flex items-center gap-3">
                <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900">
                    <Sparkles class="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">Modelo de Embeddings</p>
                    {#if loading}
                        <Spinner size="4" />
                    {:else if status}
                        <p class="font-semibold text-gray-900 dark:text-white text-sm">
                            {status.embeddingModel.model.split('/')[1] || status.embeddingModel.model}
                        </p>
                    {/if}
                </div>
            </div>
        </Card>

        <!-- Dimensions -->
        <Card class="p-4">
            <div class="flex items-center gap-3">
                <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900">
                    <Layers class="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">Dimensiones</p>
                    {#if loading}
                        <Spinner size="4" />
                    {:else if status}
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">
                            {status.embeddingModel.dimensions.toLocaleString()}
                        </p>
                    {/if}
                </div>
            </div>
        </Card>

        <!-- Document Count -->
        <Card class="p-4">
            <div class="flex items-center gap-3">
                <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900">
                    <FileText class="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">Chunks Indexados</p>
                    {#if loading}
                        <Spinner size="4" />
                    {:else if status}
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">
                            {status.documentCount}
                        </p>
                    {/if}
                </div>
            </div>
        </Card>
    </div>

    <!-- Main Content Tabs -->
    <Card class="p-0">
        <Tabs contentClass="p-4 bg-white dark:bg-gray-800 rounded-b-lg">
            <TabItem open={activeTab === 'upload'} title="Subir Documentos" onclick={() => activeTab = 'upload'}>
                {#snippet titleSlot()}
                    <div class="flex items-center gap-2">
                        <Upload class="h-4 w-4" />
                        <span>Subir Documentos</span>
                    </div>
                {/snippet}
                
                <div class="space-y-6">
                    <!-- File Upload -->
                    <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                        <h3 class="mb-4 font-semibold text-gray-900 dark:text-white">Subir Archivo</h3>
                        <div class="space-y-4">
                            <div>
                                <Label class="mb-2">Archivo (PDF, DOCX, TXT)</Label>
                                <Fileupload bind:files={uploadFiles} accept=".pdf,.docx,.txt" />
                            </div>
                            
                            <div class="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <Label class="mb-2">Tamaño de Chunk</Label>
                                    <Input type="number" bind:value={chunkSize} min="100" max="5000" />
                                    <p class="mt-1 text-xs text-gray-500">Caracteres por chunk</p>
                                </div>
                                <div>
                                    <Label class="mb-2">Overlap</Label>
                                    <Input type="number" bind:value={chunkOverlap} min="0" max="1000" />
                                    <p class="mt-1 text-xs text-gray-500">Caracteres de solapamiento</p>
                                </div>
                            </div>
                            
                            <Button color="primary" onclick={uploadDocument} disabled={uploading || !uploadFiles}>
                                {#if uploading}
                                    <Spinner size="4" class="mr-2" />
                                {:else}
                                    <Upload class="mr-2 h-4 w-4" />
                                {/if}
                                Subir y Procesar
                            </Button>
                        </div>
                    </div>

                    <!-- Direct Text Input -->
                    <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                        <h3 class="mb-4 font-semibold text-gray-900 dark:text-white">O Ingresa Texto Directamente</h3>
                        <div class="space-y-4">
                            <div>
                                <Label class="mb-2">Nombre del Documento</Label>
                                <Input bind:value={sourceName} placeholder="mi-documento" />
                            </div>
                            <div>
                                <Label class="mb-2">Texto</Label>
                                <Textarea bind:value={directText} rows={6} placeholder="Pega o escribe el texto aquí..." />
                            </div>
                            <Button color="alternative" onclick={uploadText} disabled={uploading || !directText.trim()}>
                                {#if uploading}
                                    <Spinner size="4" class="mr-2" />
                                {:else}
                                    <FileText class="mr-2 h-4 w-4" />
                                {/if}
                                Indexar Texto
                            </Button>
                        </div>
                    </div>

                    <!-- Upload Result -->
                    {#if uploadResult}
                        <Alert color="green">
                            <span class="font-medium">✓ Documento procesado:</span> 
                            {uploadResult.filename} - {uploadResult.totalChunks} chunks creados 
                            ({uploadResult.totalCharacters.toLocaleString()} caracteres)
                        </Alert>
                        
                        {#if uploadResult.chunks && uploadResult.chunks.length > 0}
                            <Accordion>
                                <AccordionItem>
                                    {#snippet header()}
                                        <span>Ver Chunks Generados ({uploadResult?.chunks?.length || 0})</span>
                                    {/snippet}
                                    <div class="max-h-96 space-y-2 overflow-y-auto">
                                        {#each uploadResult?.chunks || [] as chunk, i (chunk.id)}
                                            <div class="rounded border p-3 dark:border-gray-600">
                                                <div class="mb-2 flex items-center justify-between">
                                                    <Badge color="blue">Chunk {i + 1}</Badge>
                                                    <span class="font-mono text-xs text-gray-500">{chunk.id}</span>
                                                </div>
                                                <p class="mb-2 text-sm text-gray-700 dark:text-gray-300">{chunk.content}</p>
                                                <p class="font-mono text-xs text-gray-400">
                                                    Embedding preview: [{chunk.embeddingPreview.map(n => n.toFixed(4)).join(', ')}...]
                                                </p>
                                            </div>
                                        {/each}
                                    </div>
                                </AccordionItem>
                            </Accordion>
                        {/if}
                    {/if}
                </div>
            </TabItem>

            <TabItem title="Test Embeddings" onclick={() => activeTab = 'embeddings'}>
                {#snippet titleSlot()}
                    <div class="flex items-center gap-2">
                        <Sparkles class="h-4 w-4" />
                        <span>Test Embeddings</span>
                    </div>
                {/snippet}
                
                <div class="space-y-6">
                    <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                        <h3 class="mb-4 font-semibold text-gray-900 dark:text-white">Probar Generación de Embeddings</h3>
                        <div class="space-y-4">
                            <div>
                                <Label class="mb-2">Texto de Prueba</Label>
                                <Textarea bind:value={embeddingTestText} rows={4} placeholder="Escribe texto para generar su embedding..." />
                            </div>
                            <Button color="primary" onclick={testEmbedding} disabled={testingEmbedding || !embeddingTestText.trim()}>
                                {#if testingEmbedding}
                                    <Spinner size="4" class="mr-2" />
                                {:else}
                                    <Zap class="mr-2 h-4 w-4" />
                                {/if}
                                Generar Embedding
                            </Button>
                        </div>
                    </div>

                    {#if embeddingResult}
                        <Card class="p-4">
                            <h4 class="mb-4 font-semibold text-gray-900 dark:text-white">Resultado</h4>
                            <div class="space-y-4">
                                <div class="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">Modelo</p>
                                        <p class="font-medium text-gray-900 dark:text-white">{embeddingResult.model.model}</p>
                                    </div>
                                    <div>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">Dimensiones</p>
                                        <p class="font-medium text-gray-900 dark:text-white">{embeddingResult.dimensions}</p>
                                    </div>
                                </div>
                                <div>
                                    <p class="mb-2 text-sm text-gray-500 dark:text-gray-400">Texto procesado</p>
                                    <p class="rounded bg-gray-100 p-2 text-sm dark:bg-gray-700">{embeddingResult.text}</p>
                                </div>
                                <div>
                                    <p class="mb-2 text-sm text-gray-500 dark:text-gray-400">Vector (primeros 20 valores)</p>
                                    <div class="rounded bg-gray-100 p-3 dark:bg-gray-700">
                                        <code class="break-all font-mono text-xs">
                                            [{embeddingResult.embedding.map(n => n.toFixed(6)).join(', ')}...]
                                        </code>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    {/if}
                </div>
            </TabItem>

            <TabItem title="Búsqueda Semántica" onclick={() => activeTab = 'search'}>
                {#snippet titleSlot()}
                    <div class="flex items-center gap-2">
                        <Search class="h-4 w-4" />
                        <span>Búsqueda Semántica</span>
                    </div>
                {/snippet}
                
                <div class="space-y-6">
                    <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                        <h3 class="mb-4 font-semibold text-gray-900 dark:text-white">Buscar en Documentos</h3>
                        <div class="space-y-4">
                            <div>
                                <Label class="mb-2">Consulta de búsqueda</Label>
                                <Input bind:value={searchQuery} placeholder="¿Qué estás buscando?" />
                            </div>
                            <div>
                                <Label class="mb-2">Número de resultados: {searchLimit}</Label>
                                <Range bind:value={searchLimit} min="1" max="20" />
                            </div>
                            <Button color="primary" onclick={performSearch} disabled={searching || !searchQuery.trim()}>
                                {#if searching}
                                    <Spinner size="4" class="mr-2" />
                                {:else}
                                    <Search class="mr-2 h-4 w-4" />
                                {/if}
                                Buscar
                            </Button>
                        </div>
                    </div>

                    {#if searchResults.length > 0}
                        <div class="space-y-3">
                            <h4 class="font-semibold text-gray-900 dark:text-white">
                                Resultados ({searchResults.length})
                            </h4>
                            {#each searchResults as result, i (result.id)}
                                <Card class="p-4 cursor-pointer hover:shadow-lg transition-shadow" 
                                      onclick={() => showChunkDetails({ 
                                          content: result.payload?.content as string || '', 
                                          score: result.score, 
                                          source: result.payload?.source as string 
                                      })}>
                                    <div class="flex items-start justify-between">
                                        <Badge color="blue">#{i + 1}</Badge>
                                        {#if result.score}
                                            <Badge color="green">Score: {result.score.toFixed(4)}</Badge>
                                        {/if}
                                    </div>
                                    <p class="mt-2 text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                                        {result.payload?.content || 'Sin contenido'}
                                    </p>
                                    {#if result.payload?.source}
                                        <p class="mt-2 text-xs text-gray-500">
                                            Fuente: {result.payload.source}
                                        </p>
                                    {/if}
                                </Card>
                            {/each}
                        </div>
                    {:else if !searching && searchQuery}
                        <Alert color="yellow">
                            <span class="font-medium">Sin resultados.</span> No se encontraron documentos relevantes para tu búsqueda.
                        </Alert>
                    {/if}
                </div>
            </TabItem>

            <TabItem title="Chat RAG" onclick={() => activeTab = 'chat'}>
                {#snippet titleSlot()}
                    <div class="flex items-center gap-2">
                        <MessageSquare class="h-4 w-4" />
                        <span>Chat RAG</span>
                    </div>
                {/snippet}
                
                <div class="flex h-[600px] flex-col">
                    <!-- Model selector and actions -->
                    <div class="mb-4 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <Label class="whitespace-nowrap">Modelo:</Label>
                            <Select bind:value={selectedModel} items={availableModels} class="w-48" />
                        </div>
                        <Button color="alternative" size="sm" onclick={clearChat}>
                            <Trash2 class="mr-2 h-3 w-3" />
                            Limpiar Chat
                        </Button>
                    </div>

                    <!-- Chat messages -->
                    <div 
                        bind:this={chatContainer}
                        class="flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900"
                    >
                        {#if chatMessages.length === 0}
                            <div class="flex h-full flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                                <Bot class="mb-4 h-16 w-16 opacity-30" />
                                <p class="text-center">
                                    Haz preguntas sobre los documentos que has indexado.<br />
                                    El asistente usará RAG para encontrar contexto relevante.
                                </p>
                            </div>
                        {:else}
                            <div class="space-y-4">
                                {#each chatMessages as message, idx (idx)}
                                    <div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
                                        <div class="max-w-[80%] rounded-2xl px-4 py-2 {message.role === 'user' 
                                            ? 'bg-blue-600 text-white' 
                                            : 'bg-white dark:bg-gray-800 shadow-sm'}">
                                            {#if message.role === 'assistant'}
                                                <div class="prose prose-sm dark:prose-invert max-w-none">
                                                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                                                    {@html marked(message.content)}
                                                </div>
                                            {:else}
                                                <p class="whitespace-pre-wrap">{message.content}</p>
                                            {/if}
                                        </div>
                                    </div>
                                {/each}
                                {#if chatLoading}
                                    <div class="flex justify-start">
                                        <div class="rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-gray-800">
                                            <Spinner size="4" />
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>

                    <!-- Chat input -->
                    <div class="mt-4">
                        <form onsubmit={(e) => { e.preventDefault(); sendChatMessage(); }} class="flex gap-2">
                            <Input 
                                bind:value={chatInput} 
                                placeholder="Escribe tu pregunta..."
                                disabled={chatLoading}
                                class="flex-1"
                                onkeydown={handleChatKeydown}
                            />
                            <Button type="submit" color="primary" disabled={chatLoading || !chatInput.trim()}>
                                {#if chatLoading}
                                    <Spinner size="4" />
                                {:else}
                                    <Send class="h-4 w-4" />
                                {/if}
                            </Button>
                        </form>
                        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            {status?.documentCount || 0} chunks disponibles para RAG
                        </p>
                    </div>
                </div>
            </TabItem>

            <TabItem title="Documentos" onclick={() => { activeTab = 'documents'; fetchDocuments(); }}>
                {#snippet titleSlot()}
                    <div class="flex items-center gap-2">
                        <Database class="h-4 w-4" />
                        <span>Documentos</span>
                        {#if status?.documentCount}
                            <Badge color="gray" class="ml-1">{status.documentCount}</Badge>
                        {/if}
                    </div>
                {/snippet}
                
                <div class="space-y-4">
                    <div class="flex items-center justify-between">
                        <h3 class="font-semibold text-gray-900 dark:text-white">
                            Chunks Indexados
                        </h3>
                        <Button color="alternative" size="sm" onclick={fetchDocuments} disabled={loadingDocuments}>
                            <RefreshCw class="mr-2 h-3 w-3 {loadingDocuments ? 'animate-spin' : ''}" />
                            Recargar
                        </Button>
                    </div>

                    {#if loadingDocuments}
                        <div class="flex justify-center py-8">
                            <Spinner size="8" />
                        </div>
                    {:else if documents.length === 0}
                        <Alert color="yellow">
                            <span class="font-medium">Sin documentos.</span> No hay documentos indexados aún. 
                            Sube un documento en la pestaña "Subir Documentos".
                        </Alert>
                    {:else}
                        <div class="max-h-[500px] overflow-auto rounded-lg border dark:border-gray-600">
                            <Table striped>
                                <TableHead>
                                    <TableHeadCell>ID</TableHeadCell>
                                    <TableHeadCell>Fuente</TableHeadCell>
                                    <TableHeadCell>Chunk</TableHeadCell>
                                    <TableHeadCell>Contenido</TableHeadCell>
                                </TableHead>
                                <TableBody>
                                    {#each documents as doc (doc.id)}
                                        <TableBodyRow class="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                                      onclick={() => showChunkDetails({ 
                                                          content: doc.payload?.content as string || '', 
                                                          source: doc.payload?.source as string 
                                                      })}>
                                            <TableBodyCell class="font-mono text-xs">
                                                {String(doc.id).slice(0, 12)}...
                                            </TableBodyCell>
                                            <TableBodyCell>
                                                {doc.payload?.source || 'N/A'}
                                            </TableBodyCell>
                                            <TableBodyCell>
                                                {doc.payload?.chunkIndex ?? 'N/A'}/{doc.payload?.totalChunks ?? 'N/A'}
                                            </TableBodyCell>
                                            <TableBodyCell class="max-w-xs truncate">
                                                {(doc.payload?.content as string || '').slice(0, 80)}...
                                            </TableBodyCell>
                                        </TableBodyRow>
                                    {/each}
                                </TableBody>
                            </Table>
                        </div>
                    {/if}
                </div>
            </TabItem>
        </Tabs>
    </Card>

    <!-- Info Accordion -->
    <Accordion>
        <AccordionItem>
            {#snippet header()}
                <div class="flex items-center gap-2">
                    <Info class="h-4 w-4" />
                    <span>Información sobre el modelo de embeddings</span>
                </div>
            {/snippet}
            <div class="space-y-4 text-sm">
                <div>
                    <h4 class="font-medium text-gray-900 dark:text-white">Google Gemini Embedding</h4>
                    <p class="mt-2 text-gray-600 dark:text-gray-400">
                        Este laboratorio utiliza el modelo <code class="rounded bg-gray-100 px-1 dark:bg-gray-700">google/gemini-embedding-001</code> 
                        a través de OpenRouter para generar embeddings de {status?.embeddingModel.dimensions.toLocaleString() || '3072'} dimensiones.
                    </p>
                </div>
                <div>
                    <h4 class="font-medium text-gray-900 dark:text-white">¿Cómo funciona RAG?</h4>
                    <ol class="mt-2 list-inside list-decimal space-y-1 text-gray-600 dark:text-gray-400">
                        <li>Los documentos se dividen en chunks pequeños</li>
                        <li>Cada chunk se convierte en un vector (embedding)</li>
                        <li>Los vectores se almacenan en Qdrant</li>
                        <li>Cuando haces una pregunta, se genera su embedding</li>
                        <li>Se buscan los chunks más similares</li>
                        <li>El LLM genera una respuesta usando el contexto encontrado</li>
                    </ol>
                </div>
            </div>
        </AccordionItem>
    </Accordion>
</div>

<!-- Modal para ver chunk completo -->
<Modal bind:open={showChunkModal} title="Detalle del Chunk" size="lg">
    {#if selectedChunk}
        <div class="space-y-4">
            {#if selectedChunk.score !== undefined}
                <div>
                    <span class="text-sm text-gray-500 dark:text-gray-400">Score de similitud:</span>
                    <Badge color="green" class="ml-2">{selectedChunk.score.toFixed(4)}</Badge>
                </div>
            {/if}
            {#if selectedChunk.source}
                <div>
                    <span class="text-sm text-gray-500 dark:text-gray-400">Fuente:</span>
                    <span class="ml-2 font-medium">{selectedChunk.source}</span>
                </div>
            {/if}
            <div>
                <span class="text-sm text-gray-500 dark:text-gray-400">Contenido:</span>
                <div class="mt-2 max-h-96 overflow-y-auto rounded-lg bg-gray-100 p-4 dark:bg-gray-700">
                    <p class="whitespace-pre-wrap text-gray-800 dark:text-gray-200">{selectedChunk.content}</p>
                </div>
            </div>
        </div>
    {/if}
    
    {#snippet footer()}
        <Button color="alternative" onclick={() => showChunkModal = false}>Cerrar</Button>
    {/snippet}
</Modal>
