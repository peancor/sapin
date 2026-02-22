import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { AIImageUtils } from '$lib/server/ai/AIImageUtils';
import { ROLE_LEVELS } from '$lib/server/roles';

export const POST: RequestHandler = async ({ request, locals }) => {
    // Verificar que el usuario es admin usando el nuevo sistema de roles
    if (!locals.user || locals.user.highestRoleLevel < ROLE_LEVELS.ADMIN) {
        return json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
        const { prompt, model, aspectRatio } = await request.json();

        if (!prompt) {
            return json({ error: 'No se proporcionó un prompt' }, { status: 400 });
        }

        if (!model) {
            return json({ error: 'No se proporcionó un modelo' }, { status: 400 });
        }

        const result = await AIImageUtils.generateImage(prompt, model, aspectRatio || '1:1');

        return json({
            success: true,
            images: result.images,
            content: result.content
        });
    } catch (error) {
        console.error('Error generating image:', error);
        return json(
            { error: error instanceof Error ? error.message : 'Error desconocido' },
            { status: 500 }
        );
    }
};
