import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { interactiveLearning, interactiveLearningLesson } from '$lib/server/db/schema';
import type { InteractiveLearningStatusType } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';
import {
	loadLessonAdminData,
	requireLessonAdminContext,
	resolveLifecycleUpdate
} from './lessonAdmin';

async function persistDefinition(ilid: string, definition: ReturnType<typeof LessonService.parseDefinition>) {
	await db
		.update(interactiveLearning)
		.set({
			content: LessonService.serializeDefinition(definition),
			updatedAt: new Date()
		})
		.where(eq(interactiveLearning.id, ilid));
}

function parseStatus(statusValue: FormDataEntryValue | null): InteractiveLearningStatusType {
	const candidate = statusValue?.toString();
	return candidate === 'published' ||
		candidate === 'closed' ||
		candidate === 'archived' ||
		candidate === 'hidden'
		? candidate
		: 'hidden';
}

function asLessonError(errorValue: unknown, fallbackAction: string) {
	if (errorValue instanceof LessonServiceError) {
		return fail(errorValue.status, {
			action: fallbackAction,
			error: errorValue.message
		});
	}

	throw errorValue;
}

export const load = (async ({ params, locals }) => {
	return loadLessonAdminData(params.cid, params.ilid, locals);
}) satisfies PageServerLoad;

export const actions = {
	updateLessonMeta: async ({ request, params, locals }) => {
		const { activity, lessonConfig } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim();
		const description = formData.get('description')?.toString() || null;
		const sessionPolicyRaw = formData.get('sessionPolicy')?.toString();
		const allowRestart = formData.get('allowRestart') === 'on' || formData.get('allowRestart') === 'true';
		const status = parseStatus(formData.get('status'));

		if (!name) {
			return fail(400, {
				action: 'updateLessonMeta',
				error: 'El nombre es obligatorio.'
			});
		}

		const now = new Date();

		await db
			.update(interactiveLearning)
			.set({
				name,
				description,
				updatedAt: now,
				...resolveLifecycleUpdate(activity.status, status, now)
			})
			.where(eq(interactiveLearning.id, params.ilid));

		await db
			.update(interactiveLearningLesson)
			.set({
				sessionPolicy:
					sessionPolicyRaw === 'always_new_attempt' ? 'always_new_attempt' : 'resume_latest',
				allowRestart,
				updatedAt: now
			})
			.where(eq(interactiveLearningLesson.id, lessonConfig.id));

		return {
			success: true,
			action: 'updateLessonMeta'
		};
	},

	reorderBlocks: async ({ request, params, locals }) => {
		const { activity } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const blockId = formData.get('blockId')?.toString().trim();
		const directionRaw = formData.get('direction')?.toString();
		const direction = directionRaw === 'up' || directionRaw === 'down' ? directionRaw : null;

		if (!blockId || !direction) {
			return fail(400, {
				action: 'reorderBlocks',
				error: 'Faltan datos para reordenar el bloque.'
			});
		}

		try {
			const nextDefinition = LessonService.moveBlock(
				LessonService.parseDefinition(activity.content),
				blockId,
				direction
			);
			await persistDefinition(params.ilid, nextDefinition);
			return { success: true, action: 'reorderBlocks' };
		} catch (errorValue) {
			return asLessonError(errorValue, 'reorderBlocks');
		}
	},

	deleteBlock: async ({ request, params, locals }) => {
		const { activity } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const blockId = formData.get('blockId')?.toString().trim();

		if (!blockId) {
			return fail(400, {
				action: 'deleteBlock',
				error: 'No se indicó el bloque a eliminar.'
			});
		}

		try {
			const nextDefinition = LessonService.deleteBlock(
				LessonService.parseDefinition(activity.content),
				blockId
			);
			await persistDefinition(params.ilid, nextDefinition);
			return { success: true, action: 'deleteBlock' };
		} catch (errorValue) {
			return asLessonError(errorValue, 'deleteBlock');
		}
	},

	setEntryBlock: async ({ request, params, locals }) => {
		const { activity } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const formData = await request.formData();
		const blockId = formData.get('blockId')?.toString().trim();

		if (!blockId) {
			return fail(400, {
				action: 'setEntryBlock',
				error: 'No se indicó el bloque de entrada.'
			});
		}

		try {
			const nextDefinition = LessonService.setEntryBlock(
				LessonService.parseDefinition(activity.content),
				blockId
			);
			await persistDefinition(params.ilid, nextDefinition);
			return { success: true, action: 'setEntryBlock' };
		} catch (errorValue) {
			return asLessonError(errorValue, 'setEntryBlock');
		}
	}
} satisfies Actions;
