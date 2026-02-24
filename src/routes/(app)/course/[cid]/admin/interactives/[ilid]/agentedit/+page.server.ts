import type { PageServerLoad, Actions } from './$types';
import { db, CourseInteractiveAuthUtils } from '$lib/server/db';
import { interactiveLearning } from '$lib/server/db/schema';
import type { InteractiveLearningStatusType } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { auditService, auditAction } from '$lib/server/logging';
import DBAgentUtils from '$lib/server/db/DBAgentUtils';

function getClientIP(request: Request): string | null {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || null;
}

export const load = (async ({ params, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const { cid, ilid } = params;

    const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
        locals.user.id, cid, ilid, locals.user.highestRoleLevel
    );
    if (!access.allowed) {
        throw error(403, access.reason || 'No tienes permisos para administrar esta actividad');
    }

    const interactive = await db
        .select()
        .from(interactiveLearning)
        .where(eq(interactiveLearning.id, ilid))
        .get();

    if (!interactive) throw error(404, 'Actividad no encontrada');
    if (interactive.type !== 'agent') throw error(400, 'Esta actividad no es de tipo agente');

    const agentConfig = await DBAgentUtils.getAgentActivity(ilid);
    if (!agentConfig) throw error(404, 'Configuración agéntica no encontrada');

    const availableModels = await AIUtils.getAvailableModels();
    const models = availableModels.map(m => ({ name: m.name, provider: m.provider }));
    const defaultModel = await AIUtils.getDefaultModel();

    await DBAgentUtils.seedBuiltinTools();
    await DBAgentUtils.seedBuiltinUIComponents();
    const activeTools = await DBAgentUtils.getActiveToolDefinitions();
    const activeUIComponents = await DBAgentUtils.getAllUIComponents();

    // Get currently assigned tool and UI component IDs
    const enabledTools = await DBAgentUtils.getEnabledToolsForActivity(ilid);
    const enabledUIComponents = await DBAgentUtils.getEnabledUIComponentsForActivity(ilid);
    const assignedToolIds = enabledTools.map(t => t.id);
    const assignedUIComponentIds = enabledUIComponents.map(c => c.id);

    return {
        interactive,
        agentConfig,
        models,
        defaultModel,
        activeTools,
        activeUIComponents,
        assignedToolIds,
        assignedUIComponentIds
    };
}) satisfies PageServerLoad;

export const actions = {
    updateAgent: async ({ request, params, locals }) => {
        if (!locals.user) throw error(401, 'Unauthorized');

        const { cid, ilid } = params;
        const access = await CourseInteractiveAuthUtils.userCanAdminCourseInteractive(
            locals.user.id, cid, ilid, locals.user.highestRoleLevel
        );
        if (!access.allowed) throw error(403, access.reason || 'Forbidden');

        const data = await request.formData();
        const description = data.get('description')?.toString() ?? '';
        const statusValue = data.get('status')?.toString();
        const status = (['hidden', 'published', 'closed', 'archived'].includes(statusValue ?? ''))
            ? (statusValue as InteractiveLearningStatusType)
            : 'hidden';

        const llmRole = data.get('llmRole')?.toString() ?? '';
        const llmInstructions = data.get('llmInstructions')?.toString() ?? '';
        const llmModel = data.get('llmModel')?.toString() ?? '';
        const llmContext = data.get('llmContext')?.toString() ?? '';
        const systemPrompt = data.get('systemPrompt')?.toString() ?? '';
        const temperature = data.get('temperature') ? parseFloat(data.get('temperature')!.toString()) : 0.7;
        const maxTokens = data.get('maxTokens') ? parseInt(data.get('maxTokens')!.toString()) : 2000;
        const topP = data.get('topP') ? parseFloat(data.get('topP')!.toString()) : 0.9;

        const maxToolRoundtrips = data.get('maxToolRoundtrips') ? parseInt(data.get('maxToolRoundtrips')!.toString()) : 5;
        const parallelToolCalls = data.get('parallelToolCalls') === 'on' || data.get('parallelToolCalls') === 'true';
        const toolChoiceRaw = data.get('toolChoice')?.toString();
        const toolChoice = (['auto', 'required', 'none'].includes(toolChoiceRaw ?? '')) ? (toolChoiceRaw as 'auto' | 'required' | 'none') : 'auto';

        let selectedToolIds: string[] = [];
        let selectedUIComponentIds: string[] = [];
        try {
            const raw = data.get('selectedToolIds')?.toString();
            if (raw) selectedToolIds = JSON.parse(raw) as string[];
        } catch { /* ignore */ }
        try {
            const raw = data.get('selectedUIComponentIds')?.toString();
            if (raw) selectedUIComponentIds = JSON.parse(raw) as string[];
        } catch { /* ignore */ }

        const now = new Date();

        await db.update(interactiveLearning)
            .set({
                description,
                status,
                publishedAt: status === 'published' ? now : undefined,
                updatedAt: now
            })
            .where(eq(interactiveLearning.id, ilid));

        await DBAgentUtils.updateAgentActivity(ilid, {
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
            toolChoice
        });

        await DBAgentUtils.setActivityTools(ilid, selectedToolIds);
        await DBAgentUtils.setActivityUIComponents(ilid, selectedUIComponentIds);

        await auditService.log({
            action: auditAction.ACTIVITY_UPDATED,
            userId: locals.user.id,
            targetType: 'activity',
            targetId: ilid,
            details: { description, status, type: 'agent', courseId: cid },
            ipAddress: getClientIP(request),
            userAgent: request.headers.get('user-agent'),
            severity: 'info'
        });

        return { success: true };
    }
} satisfies Actions;
