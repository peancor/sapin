import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    checkQdrantConnection,
    getClusterInfo,
    listCollections,
    getCollectionInfo,
    createCollection,
    deleteCollection,
    countPoints,
    scrollPoints,
    deletePoints
} from '$lib/server/qdrant';

// Nivel mínimo requerido para acceder a admin
const ADMIN_LEVEL = 90;

// Verificar permisos de admin
function checkAdminAccess(locals: App.Locals) {
    if (!locals.user || locals.user.highestRoleLevel < ADMIN_LEVEL) {
        error(403, 'Acceso denegado');
    }
}

// GET: Obtener información de Qdrant
export const GET: RequestHandler = async ({ locals, url }) => {
    checkAdminAccess(locals);
    
    const action = url.searchParams.get('action') || 'status';
    const collection = url.searchParams.get('collection');
    
    try {
        switch (action) {
            case 'status': {
                const connectionStatus = await checkQdrantConnection();
                const clusterInfo = connectionStatus.connected ? await getClusterInfo() : null;
                const collections = connectionStatus.connected ? await listCollections() : null;
                
                return json({
                    connection: connectionStatus,
                    cluster: clusterInfo,
                    collections: collections?.collections || []
                });
            }
            
            case 'collections': {
                const result = await listCollections();
                return json(result);
            }
            
            case 'collection-info': {
                if (!collection) {
                    return json({ success: false, error: 'Nombre de colección requerido' }, { status: 400 });
                }
                const info = await getCollectionInfo(collection);
                const count = await countPoints(collection);
                return json({ ...info, pointsCount: count.count });
            }
            
            case 'scroll': {
                if (!collection) {
                    return json({ success: false, error: 'Nombre de colección requerido' }, { status: 400 });
                }
                const limit = parseInt(url.searchParams.get('limit') || '20');
                const offset = url.searchParams.get('offset') || undefined;
                const result = await scrollPoints(collection, limit, offset);
                return json(result);
            }
            
            default:
                return json({ error: 'Acción no válida' }, { status: 400 });
        }
    } catch (err) {
        console.error('Error en API de Qdrant:', err);
        return json({ 
            success: false, 
            error: err instanceof Error ? err.message : 'Error desconocido' 
        }, { status: 500 });
    }
};

// POST: Crear colección o realizar otras operaciones
export const POST: RequestHandler = async ({ locals, request }) => {
    checkAdminAccess(locals);
    
    try {
        const body = await request.json();
        const { action } = body;
        
        switch (action) {
            case 'create-collection': {
                const { name, vectorSize, distance } = body;
                if (!name || !vectorSize) {
                    return json({ 
                        success: false, 
                        error: 'Nombre y tamaño del vector requeridos' 
                    }, { status: 400 });
                }
                const result = await createCollection(name, vectorSize, distance || 'Cosine');
                return json(result);
            }
            
            case 'delete-collection': {
                const { name } = body;
                if (!name) {
                    return json({ success: false, error: 'Nombre de colección requerido' }, { status: 400 });
                }
                const result = await deleteCollection(name);
                return json(result);
            }
            
            case 'delete-points': {
                const { collection, pointIds } = body;
                if (!collection || !pointIds || !Array.isArray(pointIds)) {
                    return json({ 
                        success: false, 
                        error: 'Colección e IDs de puntos requeridos' 
                    }, { status: 400 });
                }
                const result = await deletePoints(collection, pointIds);
                return json(result);
            }
            
            default:
                return json({ error: 'Acción no válida' }, { status: 400 });
        }
    } catch (err) {
        console.error('Error en API de Qdrant:', err);
        return json({ 
            success: false, 
            error: err instanceof Error ? err.message : 'Error desconocido' 
        }, { status: 500 });
    }
};
