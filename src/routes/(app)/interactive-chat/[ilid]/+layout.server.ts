import { error, redirect } from '@sveltejs/kit';
import { db, InteractiveChatAuthUtils } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import {
    interactiveLearningChat,
    interactiveLearningFile,
    interactiveLearning
} from '$lib/server/db/schema';
import type { LayoutServerLoad } from './$types';

export const load = (async ({ params, locals }) => {
    const { ilid } = params;
    const user = locals.user;

    // Verificar autenticación
    if (!user) {
        throw redirect(303, '/login');
    }

    // Verificar acceso a la actividad
    const access = await InteractiveChatAuthUtils.userCanAccessInteractiveActivity(
        user.id, ilid, user.highestRoleLevel
    );

    if (!access.allowed) {
        throw error(403, access.reason || 'No tienes acceso a esta actividad');
    }

    const interactiveLearningDetails = await db
        .select()
        .from(interactiveLearning)
        .where(eq(interactiveLearning.id, ilid))
        .get();

    if (!interactiveLearningDetails) {
        throw error(404, 'Interactive learning not found');
    }

    const chat = await db
        .select()
        .from(interactiveLearningChat)
        .where(eq(interactiveLearningChat.id, ilid)) // El id del chat ES el interactiveLearningId
        .get();

    if (!chat) {
        throw error(404, 'Interactive chat not found');
    }

    const files = await db
        .select()
        .from(interactiveLearningFile)
        .where(eq(interactiveLearningFile.interactiveLearningId, ilid))
        .all();

    // Determinar si el usuario puede ver todos los chats:
    // - Admin/SuperAdmin del SISTEMA tiene acceso total
    // - Staff del curso (owner, admin, teacher, assistant) puede ver todos los chats del curso
    const canViewAllChats = access.isSystemAdmin ||
        ['owner', 'admin', 'teacher', 'assistant'].includes(access.courseRole || '');

    return {
        chat,
        files,
        interactiveLearning: interactiveLearningDetails,
        userAccess: {
            courseRole: access.courseRole,
            courseId: access.courseId,
            canViewAllChats
        }
    };
}) satisfies LayoutServerLoad;
