import type { PageServerLoad } from './$types';
import { AIUtils } from '$lib/server/ai/AIUtils';

export const load = (async () => {
    // Obtener todos los modelos activos desde la BD
    const availableModels = await AIUtils.getAvailableModels();
    
    // Los modelos ya vienen filtrados por activos desde getAvailableModels()
    const models = availableModels.map(m => ({
        name: m.name,
        provider: m.provider,
        model: m.model
    }));

    // Obtener el modelo por defecto desde la BD
    const defaultModelName = await AIUtils.getDefaultModel();

    return {
        models,
        defaultModel: defaultModelName
    };
}) satisfies PageServerLoad;
