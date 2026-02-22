import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { randomUUID } from 'crypto';
import { generateEmbedding, generateEmbeddings, getEmbeddingModelInfo, GEMINI_EMBEDDING_DIMENSIONS } from '$lib/server/qdrant/embeddings';
import { processDocument, processText } from '$lib/server/qdrant/documentProcessor';
import { 
    createCollection, 
    upsertPoints, 
    searchPoints,
    getCollectionInfo,
    countPoints,
    scrollPoints,
    deleteCollection
} from '$lib/server/qdrant';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { streamText, type ModelMessage } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

// Nivel mínimo requerido para acceder a admin
const ADMIN_LEVEL = 90;

// Collection name for RAG testing
const RAG_TEST_COLLECTION = 'rag_test_documents';

// Verificar permisos de admin
function checkAdminAccess(locals: App.Locals) {
    if (!locals.user || locals.user.highestRoleLevel < ADMIN_LEVEL) {
        error(403, 'Acceso denegado');
    }
}

// GET: Obtener información del RAG test
export const GET: RequestHandler = async ({ locals, url }) => {
    checkAdminAccess(locals);
    
    const action = url.searchParams.get('action') || 'status';
    
    try {
        switch (action) {
            case 'status': {
                const embeddingInfo = getEmbeddingModelInfo();
                let collectionExists = false;
                let documentCount = 0;
                
                try {
                    const info = await getCollectionInfo(RAG_TEST_COLLECTION);
                    collectionExists = info.success === true;
                    if (collectionExists) {
                        const count = await countPoints(RAG_TEST_COLLECTION);
                        documentCount = count.count || 0;
                    }
                } catch {
                    // Collection doesn't exist
                }
                
                return json({
                    embeddingModel: embeddingInfo,
                    collection: RAG_TEST_COLLECTION,
                    collectionExists,
                    documentCount
                });
            }
            
            case 'documents': {
                try {
                    const result = await scrollPoints(RAG_TEST_COLLECTION, 100, undefined, true, false);
                    return json({
                        success: true,
                        documents: result.points || []
                    });
                } catch {
                    return json({
                        success: true,
                        documents: []
                    });
                }
            }
            
            default:
                return json({ error: 'Acción no válida' }, { status: 400 });
        }
    } catch (err) {
        console.error('Error en API de RAG test:', err);
        return json({ 
            success: false, 
            error: err instanceof Error ? err.message : 'Error desconocido' 
        }, { status: 500 });
    }
};

// POST: Operaciones de RAG
export const POST: RequestHandler = async ({ locals, request }) => {
    checkAdminAccess(locals);
    
    try {
        const contentType = request.headers.get('content-type') || '';
        
        // Handle multipart form data for file uploads
        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const action = formData.get('action') as string;
            
            if (action === 'upload-document') {
                const file = formData.get('file') as File;
                const chunkSize = parseInt(formData.get('chunkSize') as string) || 1000;
                const chunkOverlap = parseInt(formData.get('chunkOverlap') as string) || 200;
                
                if (!file) {
                    return json({ success: false, error: 'No se proporcionó archivo' }, { status: 400 });
                }
                
                console.log(`[RAG] Processing file: ${file.name}, size: ${file.size}`);
                
                // Ensure collection exists
                const collectionInfo = await getCollectionInfo(RAG_TEST_COLLECTION);
                if (!collectionInfo.success) {
                    console.log(`[RAG] Creating collection: ${RAG_TEST_COLLECTION} with ${GEMINI_EMBEDDING_DIMENSIONS} dimensions`);
                    const createResult = await createCollection(RAG_TEST_COLLECTION, GEMINI_EMBEDDING_DIMENSIONS, 'Cosine');
                    if (!createResult.success) {
                        throw new Error(`Failed to create collection: ${createResult.error}`);
                    }
                }
                
                // Process document
                const buffer = await file.arrayBuffer();
                console.log(`[RAG] Buffer size: ${buffer.byteLength}`);
                const doc = await processDocument(buffer, file.name, { chunkSize, chunkOverlap });
                console.log(`[RAG] Document processed: ${doc.chunks.length} chunks, ${doc.metadata.totalCharacters} chars`);
                
                if (doc.chunks.length === 0) {
                    return json({ success: false, error: 'El documento no contiene texto para indexar' }, { status: 400 });
                }
                
                // Generate embeddings for all chunks
                const texts = doc.chunks.map(chunk => chunk.content);
                console.log(`[RAG] Generating embeddings for ${texts.length} chunks...`);
                const embeddings = await generateEmbeddings(texts);
                console.log(`[RAG] Generated ${embeddings.length} embeddings, first embedding dimensions: ${embeddings[0]?.length}`);
                
                // Prepare points for Qdrant - use UUID for valid IDs
                const points = doc.chunks.map((chunk, index) => ({
                    id: randomUUID(),
                    vector: embeddings[index],
                    payload: {
                        content: chunk.content,
                        source: chunk.metadata.source,
                        chunkIndex: chunk.metadata.chunkIndex,
                        totalChunks: chunk.metadata.totalChunks,
                        uploadedAt: new Date().toISOString(),
                        fileType: doc.metadata.fileType
                    }
                }));
                
                // Upsert to Qdrant
                console.log(`[RAG] Upserting ${points.length} points to Qdrant...`);
                const upsertResult = await upsertPoints(RAG_TEST_COLLECTION, points);
                console.log(`[RAG] Upsert result:`, upsertResult);
                
                if (!upsertResult.success) {
                    throw new Error(`Failed to upsert points: ${upsertResult.error}`);
                }
                
                // Verify the points were stored
                const countResult = await countPoints(RAG_TEST_COLLECTION);
                console.log(`[RAG] Collection now has ${countResult.count} points`);
                
                return json({
                    success: true,
                    document: {
                        filename: file.name,
                        fileType: doc.metadata.fileType,
                        totalCharacters: doc.metadata.totalCharacters,
                        totalChunks: doc.metadata.totalChunks
                    },
                    chunks: doc.chunks.map((chunk, i) => ({
                        id: points[i].id,
                        content: chunk.content.slice(0, 200) + (chunk.content.length > 200 ? '...' : ''),
                        embeddingPreview: embeddings[i].slice(0, 5)
                    }))
                });
            }
        }
        
        // Handle JSON requests
        const body = await request.json();
        const { action } = body;
        
        switch (action) {
            case 'upload-text': {
                const { text, sourceName, chunkSize = 1000, chunkOverlap = 200 } = body;
                
                if (!text) {
                    return json({ success: false, error: 'No se proporcionó texto' }, { status: 400 });
                }
                
                console.log(`[RAG] Processing text input, length: ${text.length}`);
                
                // Ensure collection exists
                const collectionInfo = await getCollectionInfo(RAG_TEST_COLLECTION);
                if (!collectionInfo.success) {
                    console.log(`[RAG] Creating collection: ${RAG_TEST_COLLECTION}`);
                    const createResult = await createCollection(RAG_TEST_COLLECTION, GEMINI_EMBEDDING_DIMENSIONS, 'Cosine');
                    if (!createResult.success) {
                        throw new Error(`Failed to create collection: ${createResult.error}`);
                    }
                }
                
                // Process text
                const doc = processText(text, sourceName || 'direct-input', { chunkSize, chunkOverlap });
                console.log(`[RAG] Text processed: ${doc.chunks.length} chunks`);
                
                if (doc.chunks.length === 0) {
                    return json({ success: false, error: 'El texto no generó chunks para indexar' }, { status: 400 });
                }
                
                // Generate embeddings
                const texts = doc.chunks.map(chunk => chunk.content);
                console.log(`[RAG] Generating embeddings for ${texts.length} chunks...`);
                const embeddings = await generateEmbeddings(texts);
                console.log(`[RAG] Generated ${embeddings.length} embeddings`);
                
                // Prepare and upsert points - use UUID for valid IDs
                const points = doc.chunks.map((chunk, index) => ({
                    id: randomUUID(),
                    vector: embeddings[index],
                    payload: {
                        content: chunk.content,
                        source: chunk.metadata.source,
                        chunkIndex: chunk.metadata.chunkIndex,
                        totalChunks: chunk.metadata.totalChunks,
                        uploadedAt: new Date().toISOString(),
                        fileType: 'txt'
                    }
                }));
                
                console.log(`[RAG] Upserting ${points.length} points...`);
                const upsertResult = await upsertPoints(RAG_TEST_COLLECTION, points);
                
                if (!upsertResult.success) {
                    throw new Error(`Failed to upsert points: ${upsertResult.error}`);
                }
                
                // Verify
                const countResult = await countPoints(RAG_TEST_COLLECTION);
                console.log(`[RAG] Collection now has ${countResult.count} points`);
                
                return json({
                    success: true,
                    document: {
                        filename: sourceName || 'direct-input',
                        fileType: 'txt',
                        totalCharacters: doc.metadata.totalCharacters,
                        totalChunks: doc.metadata.totalChunks
                    },
                    chunks: doc.chunks.map((chunk, i) => ({
                        id: points[i].id,
                        content: chunk.content.slice(0, 200) + (chunk.content.length > 200 ? '...' : ''),
                        embeddingPreview: embeddings[i].slice(0, 5)
                    }))
                });
            }
            
            case 'search': {
                const { query, limit = 5 } = body;
                
                if (!query) {
                    return json({ success: false, error: 'No se proporcionó consulta' }, { status: 400 });
                }
                
                console.log(`[RAG Search] Query: "${query.slice(0, 50)}..."`);
                
                // Check if collection exists
                const collectionInfo = await getCollectionInfo(RAG_TEST_COLLECTION);
                if (!collectionInfo.success) {
                    console.log(`[RAG Search] Collection does not exist`);
                    return json({
                        success: true,
                        query,
                        queryEmbeddingPreview: [],
                        results: [],
                        message: 'No hay documentos indexados. Sube un documento primero.'
                    });
                }
                
                // Check point count
                const countResult = await countPoints(RAG_TEST_COLLECTION);
                console.log(`[RAG Search] Collection has ${countResult.count} points`);
                
                if (!countResult.count || countResult.count === 0) {
                    return json({
                        success: true,
                        query,
                        queryEmbeddingPreview: [],
                        results: [],
                        message: 'La colección está vacía. Sube un documento primero.'
                    });
                }
                
                // Generate embedding for query
                console.log(`[RAG Search] Generating query embedding...`);
                const queryEmbedding = await generateEmbedding(query);
                console.log(`[RAG Search] Query embedding dimensions: ${queryEmbedding.length}`);
                
                // Search in Qdrant
                console.log(`[RAG Search] Searching with limit ${limit}...`);
                const results = await searchPoints(RAG_TEST_COLLECTION, queryEmbedding, limit);
                console.log(`[RAG Search] Found ${results.results?.length || 0} results`);
                
                if (!results.success) {
                    console.error(`[RAG Search] Search error:`, results.error);
                    throw new Error(`Search failed: ${results.error}`);
                }
                
                return json({
                    success: true,
                    query,
                    queryEmbeddingPreview: queryEmbedding.slice(0, 5),
                    results: results.results || []
                });
            }
            
            case 'test-embedding': {
                const { text } = body;
                
                if (!text) {
                    return json({ success: false, error: 'No se proporcionó texto' }, { status: 400 });
                }
                
                const embedding = await generateEmbedding(text);
                
                return json({
                    success: true,
                    text: text.slice(0, 100) + (text.length > 100 ? '...' : ''),
                    dimensions: embedding.length,
                    embedding: embedding.slice(0, 20), // First 20 values as preview
                    model: getEmbeddingModelInfo()
                });
            }
            
            case 'clear-collection': {
                try {
                    await deleteCollection(RAG_TEST_COLLECTION);
                    return json({ success: true });
                } catch {
                    return json({ success: true }); // Collection might not exist
                }
            }
            
            case 'chat': {
                const { messages, model: modelName } = body as { 
                    messages: Array<{ role: string; content: string }>;
                    model: string;
                };
                
                if (!messages || messages.length === 0) {
                    return json({ success: false, error: 'No se proporcionaron mensajes' }, { status: 400 });
                }
                
                // Get the last user message for RAG context
                const lastUserMessage = messages.filter(m => m.role === 'user').pop();
                
                if (!lastUserMessage) {
                    return json({ success: false, error: 'No hay mensaje de usuario' }, { status: 400 });
                }
                
                console.log(`[RAG Chat] Processing message: "${lastUserMessage.content.slice(0, 50)}..."`);
                
                // Generate embedding for the query and search for context
                let context = '';
                let searchSuccess = false;
                
                // Check if collection exists and has points
                const collectionInfo = await getCollectionInfo(RAG_TEST_COLLECTION);
                if (collectionInfo.success) {
                    const countResult = await countPoints(RAG_TEST_COLLECTION);
                    console.log(`[RAG Chat] Collection has ${countResult.count} points`);
                    
                    if (countResult.count && countResult.count > 0) {
                        try {
                            console.log(`[RAG Chat] Generating query embedding...`);
                            const queryEmbedding = await generateEmbedding(lastUserMessage.content);
                            console.log(`[RAG Chat] Searching for context...`);
                            const searchResults = await searchPoints(RAG_TEST_COLLECTION, queryEmbedding, 5);
                            
                            console.log(`[RAG Chat] Search results:`, searchResults.results?.length || 0);
                            
                            if (searchResults.success && searchResults.results && searchResults.results.length > 0) {
                                searchSuccess = true;
                                context = searchResults.results
                                    .map((r, i) => `[Fragmento ${i + 1}] (Score: ${r.score?.toFixed(3)})\n${r.payload?.content || ''}`)
                                    .join('\n\n---\n\n');
                                console.log(`[RAG Chat] Context built with ${searchResults.results.length} fragments`);
                            }
                        } catch (e) {
                            console.error(`[RAG Chat] Error searching:`, e);
                        }
                    }
                } else {
                    console.log(`[RAG Chat] Collection does not exist`);
                }
                
                // Build messages with RAG context
                const systemPrompt = `Eres un asistente útil que responde preguntas basándose en el contexto proporcionado.
                
Si el contexto es relevante para la pregunta, úsalo para responder. Si no hay contexto relevante o la colección está vacía, responde basándote en tu conocimiento general pero indica que no hay documentos relevantes en la base de conocimientos.

${context ? `CONTEXTO DE DOCUMENTOS RELEVANTES:\n${context}` : 'No hay documentos en la base de conocimientos actualmente.'}

Responde de forma concisa y útil. Si usas información del contexto, menciona de qué fragmento proviene.`;

                console.log(`[RAG Chat] System prompt includes context: ${searchSuccess}`);

                const modelMessages: ModelMessage[] = [
                    { role: 'system', content: systemPrompt },
                    ...messages.map(m => ({
                        role: m.role as 'user' | 'assistant',
                        content: m.content
                    }))
                ];
                
                // Get OpenRouter key
                const openRouterKey = await AIUtils.getSetting('openRouterKey');
                if (!openRouterKey) {
                    return json({ success: false, error: 'OpenRouter API key not configured' }, { status: 500 });
                }
                
                // Default to a good model if not specified
                const selectedModel = modelName || 'google/gemini-2.5-flash';
                
                const openrouter = createOpenRouter({ apiKey: openRouterKey });
                
                const result = streamText({
                    model: openrouter.chat(selectedModel),
                    messages: modelMessages,
                    temperature: 0.7
                });
                
                return result.toTextStreamResponse();
            }
            
            default:
                return json({ error: 'Acción no válida' }, { status: 400 });
        }
    } catch (err) {
        console.error('Error en API de RAG test:', err);
        return json({ 
            success: false, 
            error: err instanceof Error ? err.message : 'Error desconocido' 
        }, { status: 500 });
    }
};
