import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { db } from '$lib/server/db';
import { interactiveLearning, courseInteractiveLearning, interactiveLearningChat, interactiveLearningAgent } from '$lib/server/db/schema';
import { nanoid } from 'nanoid';
import { interactiveLearningTypes } from '$lib/constants';
import { eq, sql } from 'drizzle-orm';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { auditService, auditAction } from '$lib/server/logging';
import { generateSlug } from '$lib/utils/slug';
import { DBAgentActivityUtils, DBAgentToolUtils, DBAgentUIUtils } from '$lib/server/db/agent';

function getClientIP(request: Request): string | null {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || null;
}

export const load = (async ({ locals, params }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }

    // Cargar modelos activos desde el nuevo sistema
    const availableModels = await AIUtils.getAvailableModels();
    const models = availableModels.map(m => ({
        name: m.name,
        provider: m.provider
    }));

    // Obtener modelo por defecto
    const defaultModel = await AIUtils.getDefaultModel();

    // Seed y cargar catálogos para actividades agénticas
    await DBAgentToolUtils.seedBuiltinTools();
    await DBAgentUIUtils.seedBuiltinUIComponents();
    const activeTools = await DBAgentToolUtils.getActiveToolDefinitions();
    const activeUIComponents = await DBAgentUIUtils.getAllUIComponents();

    return {
        courseId: params.cid,
        types: Object.values(interactiveLearningTypes),
        models,
        defaultModel,
        activeTools,
        activeUIComponents
    };
}) satisfies PageServerLoad;

export const actions = {
    create: async ({ request, params, locals }) => {
        if (!locals.user) {
            throw error(401, 'Unauthorized');
        }

        const data = await request.formData();
        const name = data.get('name')?.toString();
        const description = data.get('description')?.toString();
        const type = data.get('type')?.toString();
        // Obtener status del formulario (default: draft)
        const statusValue = data.get('status')?.toString();
        const status = (statusValue === 'published' || statusValue === 'archived' || statusValue === 'hidden') ? statusValue : 'hidden';

        // Get chat configuration fields directly
        const llmRole = data.get('llmRole')?.toString() || '';
        const llmInstructions = data.get('llmInstructions')?.toString() || '';
        const llmModel = data.get('llmModel')?.toString() || '';
        const llmContext = data.get('llmContext')?.toString() || '';
        const systemPrompt = data.get('systemPrompt')?.toString() || '';
        const temperature = data.get('temperature') ? parseFloat(data.get('temperature')?.toString() || '0.7') : 0.7;
        const maxTokens = data.get('maxTokens') ? parseInt(data.get('maxTokens')?.toString() || '2000') : 2000;
        const topP = data.get('topP') ? parseFloat(data.get('topP')?.toString() || '0.9') : 0.9;

        if (!name || !type || !Object.values(interactiveLearningTypes).includes(type as any)) {
            throw error(400, 'Invalid input');
        }

        const id = nanoid();
        const now = new Date();

        // Create content JSON for backward compatibility
        const content = JSON.stringify({
            llmRole,
            llmInstructions,
            llmModel,
            temperature,
            maxTokens,
            topP,
            systemPrompt
        }, null, 2);

        // Generar slug único
        const existingSlugs = await db
            .select({ slug: interactiveLearning.slug })
            .from(interactiveLearning)
            .then(rows => rows.map(r => r.slug));
        const slug = generateSlug(name, 60);
        let finalSlug = slug;
        let counter = 1;
        while (existingSlugs.includes(finalSlug)) {
            finalSlug = `${slug}-${counter}`;
            counter++;
        }

        // Crear el interactive learning
        await db.insert(interactiveLearning).values({
            id,
            name,
            slug: finalSlug,
            description,
            type,
            content,
            status,
            publishedAt: status === 'published' ? now : null,
            createdAt: now,
            updatedAt: now
        });

        // Si es de tipo chat, crear el interactiveLearningChat con el MISMO ID (patrón de herencia 1:1)
        if (type === 'chat') {
            await db.insert(interactiveLearningChat).values({
                id, // Mismo ID que interactiveLearning
                llmRole,
                llmInstructions,
                llmContext,
                systemPrompt,
                llmModel: llmModel || 'GPT-4o',
                temperature,
                maxTokens,
                topP,
                createdAt: now,
                metadata: '{}'
            });
        } else if (type === 'agent') {
            const maxToolRoundtrips = data.get('maxToolRoundtrips') ? parseInt(data.get('maxToolRoundtrips')?.toString() || '5') : 5;
            const parallelToolCalls = data.get('parallelToolCalls') === 'on' || data.get('parallelToolCalls') === 'true';
            const toolChoice = (['auto', 'required', 'none'].includes(data.get('toolChoice')?.toString() ?? '')) ? (data.get('toolChoice')?.toString() as 'auto' | 'required' | 'none') : 'auto';

            let selectedToolIds: string[] = [];
            let selectedUIComponentIds: string[] = [];
            try {
                const toolIdsRaw = data.get('selectedToolIds')?.toString();
                if (toolIdsRaw) selectedToolIds = JSON.parse(toolIdsRaw) as string[];
            } catch { /* ignore */ }
            try {
                const uiIdsRaw = data.get('selectedUIComponentIds')?.toString();
                if (uiIdsRaw) selectedUIComponentIds = JSON.parse(uiIdsRaw) as string[];
            } catch { /* ignore */ }

            await db.insert(interactiveLearningAgent).values({
                id,
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
                createdAt: now
            });

            await DBAgentActivityUtils.setActivityTools(id, selectedToolIds);
            await DBAgentActivityUtils.setActivityUIComponents(id, selectedUIComponentIds);
        }

        // Obtener el último orden para este curso
        const { count } = await db
            .select({ count: sql<number>`count(*)`.as('count') })
            .from(courseInteractiveLearning)
            .where(eq(courseInteractiveLearning.courseId, params.cid))
            .then(rows => rows[0] ?? { count: 0 });

        // Asociar al curso con el siguiente orden
        await db.insert(courseInteractiveLearning).values({
            id: nanoid(),
            courseId: params.cid,
            interactiveLearningId: id,
            order: count + 1,
            createdAt: now
        });

        // Audit log
        await auditService.log({
            action: auditAction.ACTIVITY_CREATED,
            userId: locals.user.id,
            targetType: 'activity',
            targetId: id,
            details: { name, description, type, courseId: params.cid },
            ipAddress: getClientIP(request),
            userAgent: request.headers.get('user-agent'),
            severity: 'info'
        });

        // Redirect to course administration page
        throw redirect(303, `/course/${params.cid}/admin`);
    }
} satisfies Actions;