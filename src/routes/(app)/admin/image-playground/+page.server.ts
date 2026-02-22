import type { PageServerLoad } from './$types';
import { AIImageUtils } from '$lib/server/ai/AIImageUtils';

export const load = (async () => {
    // Obtener todos los modelos de imagen disponibles
    const imageModels = await AIImageUtils.getAvailableImageModels();
    
    const models = imageModels.map(m => ({
        name: m.name,
        provider: m.provider
    }));

    // Obtener los aspect ratios disponibles
    const aspectRatios = AIImageUtils.IMAGE_ASPECT_RATIOS.map(ar => ({
        value: ar.value,
        label: ar.label
    }));

    return {
        models,
        aspectRatios,
        defaultModel: models[0]?.name || '',
        defaultAspectRatio: '1:1'
    };
}) satisfies PageServerLoad;
