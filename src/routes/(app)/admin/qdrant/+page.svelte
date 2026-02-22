<script lang="ts">
    import { onMount } from 'svelte';
    import { 
        Button, 
        Card, 
        Badge, 
        Spinner, 
        Modal, 
        Label, 
        Input, 
        Select,
        Table,
        TableHead,
        TableHeadCell,
        TableBody,
        TableBodyRow,
        TableBodyCell,
        Alert,
        Accordion,
        AccordionItem
    } from 'flowbite-svelte';
    import { 
        Database, 
        RefreshCw, 
        Plus, 
        Trash2, 
        Info, 
        CheckCircle, 
        XCircle,
        Layers,
        Hash,
        Box,
        Eye,
        FlaskConical
    } from 'lucide-svelte';

    // Estado de conexión
    let connectionStatus = $state<{
        connected: boolean;
        version?: string;
        error?: string;
    } | null>(null);
    
    let clusterInfo = $state<Record<string, unknown> | null>(null);
    let collections = $state<Array<{ name: string }>>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    
    // Modal para crear colección
    let showCreateModal = $state(false);
    let newCollectionName = $state('');
    let newVectorSize = $state(1536); // Default para OpenAI embeddings
    let newDistance = $state('Cosine');
    let creating = $state(false);
    
    // Modal para ver colección
    let showCollectionModal = $state(false);
    let selectedCollection = $state<string | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let collectionInfo = $state<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let collectionPoints = $state<Array<any>>([]);
    let loadingCollection = $state(false);
    
    // Modal para confirmar eliminación
    let showDeleteModal = $state(false);
    let collectionToDelete = $state<string | null>(null);
    let deleting = $state(false);

    const distanceOptions = [
        { value: 'Cosine', name: 'Cosine (recomendado)' },
        { value: 'Euclid', name: 'Euclidean' },
        { value: 'Dot', name: 'Dot Product' }
    ];

    const vectorSizePresets = [
        { value: 384, name: '384 (all-MiniLM-L6-v2)' },
        { value: 768, name: '768 (BERT base)' },
        { value: 1024, name: '1024 (BERT large)' },
        { value: 1536, name: '1536 (OpenAI Ada)' },
        { value: 3072, name: '3072 (OpenAI text-embedding-3-large)' }
    ];

    async function fetchStatus() {
        loading = true;
        error = null;
        
        try {
            const response = await fetch('/api/admin/qdrant?action=status');
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Error al obtener estado');
            }
            
            connectionStatus = data.connection;
            clusterInfo = data.cluster?.data || null;
            collections = data.collections || [];
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error desconocido';
            connectionStatus = { connected: false, error: error };
        } finally {
            loading = false;
        }
    }

    async function createCollection() {
        if (!newCollectionName.trim()) return;
        
        creating = true;
        try {
            const response = await fetch('/api/admin/qdrant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create-collection',
                    name: newCollectionName.trim(),
                    vectorSize: newVectorSize,
                    distance: newDistance
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Error al crear colección');
            }
            
            showCreateModal = false;
            newCollectionName = '';
            await fetchStatus();
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error al crear colección';
        } finally {
            creating = false;
        }
    }

    async function confirmDeleteCollection() {
        if (!collectionToDelete) return;
        
        deleting = true;
        try {
            const response = await fetch('/api/admin/qdrant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete-collection',
                    name: collectionToDelete
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Error al eliminar colección');
            }
            
            showDeleteModal = false;
            collectionToDelete = null;
            await fetchStatus();
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error al eliminar colección';
        } finally {
            deleting = false;
        }
    }

    async function viewCollection(name: string) {
        selectedCollection = name;
        showCollectionModal = true;
        loadingCollection = true;
        collectionInfo = null;
        collectionPoints = [];
        
        try {
            // Obtener info de la colección
            const infoResponse = await fetch(`/api/admin/qdrant?action=collection-info&collection=${encodeURIComponent(name)}`);
            const infoData = await infoResponse.json();
            
            if (infoData.success !== false) {
                collectionInfo = infoData;
            }
            
            // Obtener puntos
            const pointsResponse = await fetch(`/api/admin/qdrant?action=scroll&collection=${encodeURIComponent(name)}&limit=20`);
            const pointsData = await pointsResponse.json();
            
            if (pointsData.success !== false) {
                collectionPoints = pointsData.points || [];
            }
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error al cargar colección';
        } finally {
            loadingCollection = false;
        }
    }

    function openDeleteModal(name: string) {
        collectionToDelete = name;
        showDeleteModal = true;
    }

    function formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    onMount(() => {
        fetchStatus();
    });
</script>

<div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Qdrant</h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Base de datos vectorial para búsqueda semántica e IA
            </p>
        </div>
        <div class="flex gap-2">
            <Button color="purple" href="/admin/qdrant/rag-test">
                <FlaskConical class="mr-2 h-4 w-4" />
                RAG Test Lab
            </Button>
            <Button color="alternative" onclick={fetchStatus} disabled={loading}>
                <RefreshCw class="mr-2 h-4 w-4 {loading ? 'animate-spin' : ''}" />
                Actualizar
            </Button>
            <Button color="primary" onclick={() => showCreateModal = true} disabled={!connectionStatus?.connected}>
                <Plus class="mr-2 h-4 w-4" />
                Nueva Colección
            </Button>
        </div>
    </div>

    <!-- Error Alert -->
    {#if error}
        <Alert color="red" dismissable onclose={() => error = null}>
            <span class="font-medium">Error:</span> {error}
        </Alert>
    {/if}

    <!-- Connection Status Card -->
    <Card class="p-6">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
                <div class="flex h-14 w-14 items-center justify-center rounded-xl {connectionStatus?.connected ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}">
                    <Database class="h-7 w-7 {connectionStatus?.connected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}" />
                </div>
                <div>
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Estado de Conexión</h3>
                    {#if loading}
                        <div class="flex items-center gap-2 text-gray-500">
                            <Spinner size="4" />
                            <span>Verificando conexión...</span>
                        </div>
                    {:else if connectionStatus?.connected}
                        <div class="flex items-center gap-2">
                            <Badge color="green">
                                <CheckCircle class="mr-1 h-3 w-3" />
                                Conectado
                            </Badge>
                            {#if connectionStatus.version}
                                <span class="text-sm text-gray-500 dark:text-gray-400">{connectionStatus.version}</span>
                            {/if}
                        </div>
                    {:else}
                        <div class="flex items-center gap-2">
                            <Badge color="red">
                                <XCircle class="mr-1 h-3 w-3" />
                                Desconectado
                            </Badge>
                            {#if connectionStatus?.error}
                                <span class="text-sm text-red-500">{connectionStatus.error}</span>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>
            {#if clusterInfo}
                <div class="text-right">
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{collections.length}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">Colecciones</p>
                </div>
            {/if}
        </div>
    </Card>

    <!-- Collections Grid -->
    {#if connectionStatus?.connected}
        <div class="space-y-4">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                Colecciones ({collections.length})
            </h2>
            
            {#if collections.length === 0}
                <Card class="p-8">
                    <div class="flex flex-col items-center justify-center py-8 text-center">
                        <Layers class="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
                        <h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">
                            No hay colecciones
                        </h3>
                        <p class="mb-4 text-gray-500 dark:text-gray-400">
                            Crea tu primera colección para empezar a almacenar vectores
                        </p>
                        <Button color="primary" onclick={() => showCreateModal = true}>
                            <Plus class="mr-2 h-4 w-4" />
                            Crear Colección
                        </Button>
                    </div>
                </Card>
            {:else}
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {#each collections as collection (collection.name)}
                        <Card class="p-6 transition-shadow hover:shadow-lg">
                            <div class="flex items-start justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
                                        <Box class="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <h3 class="font-semibold text-gray-900 dark:text-white">{collection.name}</h3>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">Colección de vectores</p>
                                    </div>
                                </div>
                            </div>
                            <div class="mt-4 flex gap-2">
                                <Button size="xs" color="alternative" onclick={() => viewCollection(collection.name)}>
                                    <Eye class="mr-1 h-3 w-3" />
                                    Ver
                                </Button>
                                <Button size="xs" color="red" outline onclick={() => openDeleteModal(collection.name)}>
                                    <Trash2 class="mr-1 h-3 w-3" />
                                    Eliminar
                                </Button>
                            </div>
                        </Card>
                    {/each}
                </div>
            {/if}
        </div>
    {:else if !loading}
        <Card class="p-8">
            <div class="flex flex-col items-center justify-center py-8 text-center">
                <XCircle class="mb-4 h-16 w-16 text-red-300 dark:text-red-600" />
                <h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">
                    No se puede conectar a Qdrant
                </h3>
                <p class="mb-4 max-w-md text-gray-500 dark:text-gray-400">
                    Verifica que Qdrant esté en ejecución y que las variables de entorno 
                    <code class="rounded bg-gray-100 px-1 dark:bg-gray-700">QDRANT_URL</code> y 
                    <code class="rounded bg-gray-100 px-1 dark:bg-gray-700">QDRANT_API_KEY</code> 
                    estén configuradas correctamente.
                </p>
                <Button color="alternative" onclick={fetchStatus}>
                    <RefreshCw class="mr-2 h-4 w-4" />
                    Reintentar conexión
                </Button>
            </div>
        </Card>
    {/if}

    <!-- Configuration Info -->
    <Accordion>
        <AccordionItem>
            {#snippet header()}
                <div class="flex items-center gap-2">
                    <Info class="h-4 w-4" />
                    <span>Información de Configuración</span>
                </div>
            {/snippet}
            <div class="space-y-4 text-sm">
                <div>
                    <h4 class="font-medium text-gray-900 dark:text-white">Variables de Entorno</h4>
                    <ul class="mt-2 list-inside list-disc space-y-1 text-gray-600 dark:text-gray-400">
                        <li><code class="rounded bg-gray-100 px-1 dark:bg-gray-700">QDRANT_URL</code> - URL del servidor Qdrant (por defecto: http://localhost:6333)</li>
                        <li><code class="rounded bg-gray-100 px-1 dark:bg-gray-700">QDRANT_API_KEY</code> - API Key (opcional, para autenticación)</li>
                    </ul>
                </div>
                <div>
                    <h4 class="font-medium text-gray-900 dark:text-white">Tamaños de Vector Comunes</h4>
                    <ul class="mt-2 list-inside list-disc space-y-1 text-gray-600 dark:text-gray-400">
                        <li><strong>1536</strong> - OpenAI text-embedding-ada-002</li>
                        <li><strong>3072</strong> - OpenAI text-embedding-3-large</li>
                        <li><strong>768</strong> - BERT base, Sentence Transformers</li>
                        <li><strong>384</strong> - all-MiniLM-L6-v2</li>
                    </ul>
                </div>
            </div>
        </AccordionItem>
    </Accordion>
</div>

<!-- Modal: Crear Colección -->
<Modal bind:open={showCreateModal} title="Crear Nueva Colección" size="md">
    <form onsubmit={(e) => { e.preventDefault(); createCollection(); }}>
        <div class="space-y-4">
            <div>
                <Label for="collection-name" class="mb-2">Nombre de la Colección</Label>
                <Input 
                    id="collection-name" 
                    bind:value={newCollectionName} 
                    placeholder="mi_coleccion"
                    required
                />
                <p class="mt-1 text-xs text-gray-500">Solo letras, números y guiones bajos</p>
            </div>
            
            <div>
                <Label for="vector-size" class="mb-2">Tamaño del Vector</Label>
                <Select id="vector-size" bind:value={newVectorSize} items={vectorSizePresets} />
            </div>
            
            <div>
                <Label for="distance" class="mb-2">Función de Distancia</Label>
                <Select id="distance" bind:value={newDistance} items={distanceOptions} />
            </div>
        </div>
    </form>
    
    {#snippet footer()}
        <div class="flex justify-end gap-2">
            <Button color="alternative" onclick={() => showCreateModal = false}>
                Cancelar
            </Button>
            <Button color="primary" onclick={createCollection} disabled={creating || !newCollectionName.trim()}>
                {#if creating}
                    <Spinner size="4" class="mr-2" />
                {/if}
                Crear Colección
            </Button>
        </div>
    {/snippet}
</Modal>

<!-- Modal: Ver Colección -->
<Modal bind:open={showCollectionModal} title="Detalles de Colección: {selectedCollection}" size="xl">
    {#if loadingCollection}
        <div class="flex items-center justify-center py-8">
            <Spinner size="8" />
        </div>
    {:else}
        <div class="space-y-4">
            <!-- Info de la colección -->
            {#if collectionInfo}
                <div class="grid gap-4 sm:grid-cols-3">
                    <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
                        <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                            <Hash class="h-4 w-4" />
                            <span class="text-sm">Puntos</span>
                        </div>
                        <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                            {collectionInfo.pointsCount ?? 0}
                        </p>
                    </div>
                    {#if collectionInfo.data?.config?.params?.vectors}
                        <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
                            <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                <Layers class="h-4 w-4" />
                                <span class="text-sm">Dimensiones</span>
                            </div>
                            <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                                {collectionInfo.data.config.params.vectors.size ?? 'N/A'}
                            </p>
                        </div>
                        <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
                            <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                <Info class="h-4 w-4" />
                                <span class="text-sm">Distancia</span>
                            </div>
                            <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                                {collectionInfo.data.config.params.vectors.distance ?? 'N/A'}
                            </p>
                        </div>
                    {/if}
                </div>
            {/if}
            
            <!-- Tabla de puntos -->
            <div>
                <h4 class="mb-2 font-medium text-gray-900 dark:text-white">
                    Puntos Recientes ({collectionPoints.length})
                </h4>
                {#if collectionPoints.length > 0}
                    <div class="max-h-64 overflow-auto rounded-lg border dark:border-gray-600">
                        <Table striped>
                            <TableHead>
                                <TableHeadCell>ID</TableHeadCell>
                                <TableHeadCell>Payload</TableHeadCell>
                            </TableHead>
                            <TableBody>
                                {#each collectionPoints as point (point.id)}
                                    <TableBodyRow>
                                        <TableBodyCell class="font-mono text-xs">
                                            {point.id}
                                        </TableBodyCell>
                                        <TableBodyCell class="max-w-md truncate text-xs">
                                            {JSON.stringify(point.payload || {}).slice(0, 100)}...
                                        </TableBodyCell>
                                    </TableBodyRow>
                                {/each}
                            </TableBody>
                        </Table>
                    </div>
                {:else}
                    <p class="text-center text-gray-500 dark:text-gray-400 py-4">
                        No hay puntos en esta colección
                    </p>
                {/if}
            </div>
        </div>
    {/if}
    
    {#snippet footer()}
        <Button color="alternative" onclick={() => showCollectionModal = false}>
            Cerrar
        </Button>
    {/snippet}
</Modal>

<!-- Modal: Confirmar Eliminación -->
<Modal bind:open={showDeleteModal} title="Confirmar Eliminación" size="sm">
    <p class="text-gray-600 dark:text-gray-400">
        ¿Estás seguro de que deseas eliminar la colección 
        <strong class="text-gray-900 dark:text-white">{collectionToDelete}</strong>?
    </p>
    <p class="mt-2 text-sm text-red-600 dark:text-red-400">
        Esta acción no se puede deshacer. Todos los vectores almacenados serán eliminados permanentemente.
    </p>
    
    {#snippet footer()}
        <div class="flex justify-end gap-2">
            <Button color="alternative" onclick={() => showDeleteModal = false}>
                Cancelar
            </Button>
            <Button color="red" onclick={confirmDeleteCollection} disabled={deleting}>
                {#if deleting}
                    <Spinner size="4" class="mr-2" />
                {/if}
                Eliminar
            </Button>
        </div>
    {/snippet}
</Modal>
