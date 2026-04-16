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
import { interactiveLearningLesson } from '$lib/server/db/schema';
import { LessonService } from '$lib/server/lesson/LessonService';

function getClientIP(request: Request): string | null {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || null;
}

export const load = (async ({ locals, params }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }

    return {
        courseId: params.cid,
        types: Object.values(interactiveLearningTypes)
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
        const statusValue = data.get('status')?.toString();
        const status = (statusValue === 'published' || statusValue === 'closed' || statusValue === 'archived' || statusValue === 'hidden')
            ? statusValue
            : 'hidden';

        if (!name || !type || !['chat', 'agent', 'lesson'].includes(type)) {
            throw error(400, 'Invalid input');
        }

        const id = nanoid();
        const now = new Date();
        const defaultModel = type === 'lesson' ? '' : await AIUtils.getDefaultModel();
        const llmRole = '';
        const llmInstructions = '';
        const llmContext = '';
        const systemPrompt = '';
        const llmModel = defaultModel || 'GPT-4o';
        const temperature = 0.7;
        const maxTokens = 2000;
        const topP = 0.9;
        const lessonDefinition = LessonService.createDefaultDefinition();
        const sessionPolicy = 'resume_latest' as const;
        const allowRestart = true;

        const content = type === 'lesson'
            ? LessonService.serializeDefinition(lessonDefinition)
            : JSON.stringify({
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

        if (type === 'chat') {
            await db.insert(interactiveLearningChat).values({
                id,
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
                maxToolRoundtrips: 5,
                parallelToolCalls: false,
                toolChoice: 'auto',
                finalizationEnabled: true,
                finalizationToolName: 'finalize_activity',
                finalizationHandler: 'mark_complete_and_notify',
                finalizationConfig: null,
                requireFinalizationToolCall: true,
                createdAt: now
            });
        } else if (type === 'lesson') {
            await db.insert(interactiveLearningLesson).values({
                id,
                sessionPolicy,
                allowRestart,
                metadata: null,
                createdAt: now,
                updatedAt: now
            });
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

        const editPath = type === 'chat'
            ? `/course/${params.cid}/admin/interactives/${id}/chatedit`
            : type === 'agent'
                ? `/course/${params.cid}/admin/interactives/${id}/agentedit`
                : `/course/${params.cid}/admin/interactives/${id}/lessonedit`;

        throw redirect(303, editPath);
    }
} satisfies Actions;
