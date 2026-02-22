import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '$env/dynamic/private';

// Configuración de Qdrant desde variables de entorno
const QDRANT_URL = env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = env.QDRANT_API_KEY || undefined;

// Cliente singleton de Qdrant
let qdrantClient: QdrantClient | null = null;

type QdrantConnectionConfig = {
    host: string;
    port: number;
    https: boolean;
};

function parseQdrantUrl(rawUrl: string): QdrantConnectionConfig {
    const fallbackHost = 'localhost';
    const fallbackPort = 6333;

    let normalized = rawUrl?.trim() || '';
    if (!normalized) {
        return { host: fallbackHost, port: fallbackPort, https: false };
    }

    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalized)) {
        normalized = `http://${normalized}`;
    }

    try {
        const parsed = new URL(normalized);
        const host = parsed.hostname || fallbackHost;
        const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : fallbackPort);
        const https = parsed.protocol === 'https:';
        return { host, port, https };
    } catch {
        return { host: fallbackHost, port: fallbackPort, https: false };
    }
}

/**
 * Obtiene el cliente de Qdrant (singleton)
 */
export function getQdrantClient(): QdrantClient {
    if (!qdrantClient) {
        const { host, port, https } = parseQdrantUrl(QDRANT_URL);
        qdrantClient = new QdrantClient({
            host,
            port,
            https,
            apiKey: QDRANT_API_KEY,
        });
    }
    return qdrantClient;
}

/**
 * Verifica la conexión con Qdrant
 */
export async function checkQdrantConnection(): Promise<{ connected: boolean; version?: string; error?: string }> {
    try {
        const client = getQdrantClient();
        // Intentar obtener colecciones para verificar conexión
        const collections = await client.getCollections();
        // Si llegamos aquí, la conexión funciona
        return { 
            connected: true, 
            version: `${collections.collections.length} colecciones`
        };
    } catch (error) {
        return { 
            connected: false, 
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}

/**
 * Verifica si una colección existe
 */
export async function collectionExists(collectionName: string): Promise<boolean> {
    const client = getQdrantClient();
    try {
        await client.getCollection(collectionName);
        return true;
    } catch {
        return false;
    }
}

/**
 * Asegura que una colección existe, creándola si no
 */
export async function ensureCollection(
    collectionName: string,
    vectorSize: number,
    distance: 'Cosine' | 'Euclid' | 'Dot' = 'Cosine'
): Promise<{ success: boolean; created: boolean; error?: string }> {
    try {
        const exists = await collectionExists(collectionName);
        if (exists) {
            return { success: true, created: false };
        }
        
        const result = await createCollection(collectionName, vectorSize, distance);
        if (result.success) {
            return { success: true, created: true };
        }
        return { success: false, created: false, error: result.error };
    } catch (error) {
        return {
            success: false,
            created: false,
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}

/**
 * Obtiene información detallada del cluster
 */
export async function getClusterInfo() {
    const client = getQdrantClient();
    try {
        const collections = await client.getCollections();
        return {
            success: true,
            data: {
                collections: collections.collections.length,
                collectionsInfo: collections.collections
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}

/**
 * Lista todas las colecciones
 */
export async function listCollections() {
    const client = getQdrantClient();
    try {
        const collections = await client.getCollections();
        return {
            success: true,
            collections: collections.collections
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido',
            collections: []
        };
    }
}

/**
 * Obtiene información detallada de una colección
 */
export async function getCollectionInfo(collectionName: string) {
    const client = getQdrantClient();
    try {
        const info = await client.getCollection(collectionName);
        return {
            success: true,
            data: info
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}

/**
 * Crea una nueva colección
 */
export async function createCollection(
    collectionName: string, 
    vectorSize: number, 
    distance: 'Cosine' | 'Euclid' | 'Dot' = 'Cosine'
) {
    const client = getQdrantClient();
    try {
        await client.createCollection(collectionName, {
            vectors: {
                size: vectorSize,
                distance: distance
            }
        });
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}

/**
 * Elimina una colección
 */
export async function deleteCollection(collectionName: string) {
    const client = getQdrantClient();
    try {
        await client.deleteCollection(collectionName);
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}

/**
 * Inserta puntos en una colección
 */
export async function upsertPoints(
    collectionName: string,
    points: Array<{
        id: string | number;
        vector: number[];
        payload?: Record<string, unknown>;
    }>
) {
    const client = getQdrantClient();
    try {
        console.log(`[Qdrant] Upserting ${points.length} points to ${collectionName}`);
        console.log(`[Qdrant] First point ID: ${points[0]?.id}, vector length: ${points[0]?.vector?.length}`);
        
        await client.upsert(collectionName, {
            wait: true,
            points: points.map(p => ({
                id: p.id,
                vector: p.vector,
                payload: p.payload
            }))
        });
        return { success: true };
    } catch (error) {
        console.error('[Qdrant] Upsert error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}

/**
 * Busca puntos similares en una colección
 */
export async function searchPoints(
    collectionName: string,
    vector: number[],
    limit: number = 10,
    filter?: Record<string, unknown>
) {
    const client = getQdrantClient();
    try {
        const results = await client.search(collectionName, {
            vector,
            limit,
            filter,
            with_payload: true,
            with_vector: false
        });
        return {
            success: true,
            results
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido',
            results: []
        };
    }
}

/**
 * Cuenta los puntos en una colección
 */
export async function countPoints(collectionName: string) {
    const client = getQdrantClient();
    try {
        const count = await client.count(collectionName);
        return {
            success: true,
            count: count.count
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido',
            count: 0
        };
    }
}

/**
 * Obtiene puntos por scroll (paginación)
 */
export async function scrollPoints(
    collectionName: string,
    limit: number = 10,
    offset?: string | number | null,
    withPayload: boolean = true,
    withVector: boolean = false
) {
    const client = getQdrantClient();
    try {
        const result = await client.scroll(collectionName, {
            limit,
            offset,
            with_payload: withPayload,
            with_vector: withVector
        });
        return {
            success: true,
            points: result.points,
            nextOffset: result.next_page_offset
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido',
            points: [],
            nextOffset: null
        };
    }
}

/**
 * Elimina puntos de una colección
 */
export async function deletePoints(
    collectionName: string,
    pointIds: Array<string | number>
) {
    const client = getQdrantClient();
    try {
        // Verificar que la colección existe antes de intentar eliminar
        const exists = await collectionExists(collectionName);
        if (!exists) {
            console.log(`[Qdrant] Collection ${collectionName} does not exist, skipping delete`);
            return { success: true }; // No hay error, simplemente no existe
        }
        
        await client.delete(collectionName, {
            wait: true,
            points: pointIds
        });
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}

/**
 * Elimina una colección si está vacía
 * @returns true si fue eliminada, false si tiene puntos o no existe
 */
export async function deleteCollectionIfEmpty(collectionName: string): Promise<{ deleted: boolean; pointCount?: number; error?: string }> {
    try {
        const exists = await collectionExists(collectionName);
        if (!exists) {
            return { deleted: false, pointCount: 0 };
        }
        
        const countResult = await countPoints(collectionName);
        if (!countResult.success) {
            return { deleted: false, error: countResult.error };
        }
        
        if (countResult.count === 0) {
            const deleteResult = await deleteCollection(collectionName);
            if (deleteResult.success) {
                console.log(`[Qdrant] Deleted empty collection: ${collectionName}`);
                return { deleted: true, pointCount: 0 };
            }
            return { deleted: false, error: deleteResult.error };
        }
        
        return { deleted: false, pointCount: countResult.count };
    } catch (error) {
        return {
            deleted: false,
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}

// Exportar el cliente para uso directo si es necesario
export { QdrantClient };
