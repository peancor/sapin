import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { interactiveLearning, interactiveLearningLesson } from '$lib/server/db/schema';
import type { InteractiveLearningStatusType } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { LessonService, LessonServiceError } from '$lib/server/lesson/LessonService';
import { LessonRevisionService } from '$lib/server/lesson/LessonRevisionService';
import { getAllLessonSafeAgentToolIds } from '$lib/server/lesson/lessonAgentTools';
import {
	loadLessonAdminData,
	requireLessonAdminContext,
	resolveLifecycleUpdate
} from './lessonAdmin';

async function persistDefinition(input: {
	ilid: string;
	definition: ReturnType<typeof LessonService.parseDefinition>;
	userId: string;
}) {
	await LessonRevisionService.saveDraftDefinition({
		interactiveLearningId: input.ilid,
		definition: input.definition,
		actorUserId: input.userId
	});
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

function parseSelectedToolIds(formData: FormData, safeToolIds: string[]): string[] {
	const safeToolIdSet = new Set(safeToolIds);
	const rawValue = formData.get('selectedToolIdsJson')?.toString().trim();

	if (!rawValue) return [];

	try {
		const parsed = JSON.parse(rawValue) as unknown;
		if (!Array.isArray(parsed)) return [];

		return parsed
			.filter((value): value is string => typeof value === 'string')
			.map((value) => value.trim())
			.filter((value) => safeToolIdSet.has(value))
			.filter((value, index, list) => list.indexOf(value) === index);
	} catch {
		return [];
	}
}

export const load = (async ({ params, locals }) => {
	return loadLessonAdminData(params.cid, params.ilid, locals);
}) satisfies PageServerLoad;

export const actions = {
	updateLessonMeta: async ({ request, params, locals }) => {
		const { activity, lessonConfig } = await requireLessonAdminContext(
			params.cid,
			params.ilid,
			locals
		);
		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim();
		const description = formData.get('description')?.toString() || null;
		const sessionPolicyRaw = formData.get('sessionPolicy')?.toString();
		const allowRestart =
			formData.get('allowRestart') === 'on' || formData.get('allowRestart') === 'true';
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

	updateAgentPolicy: async ({ request, params, locals }) => {
		const { user } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const revisionState = await LessonRevisionService.ensureLessonRevisionState(params.ilid, {
			actorUserId: user.id
		});
		const formData = await request.formData();
		const lessonSafeToolIds = getAllLessonSafeAgentToolIds();
		const selectedToolIds = parseSelectedToolIds(formData, lessonSafeToolIds);
		const nextAllowedAgentToolIds =
			selectedToolIds.length === 0 || selectedToolIds.length === lessonSafeToolIds.length
				? undefined
				: selectedToolIds;
		const allowedToolIds = new Set(nextAllowedAgentToolIds ?? lessonSafeToolIds);

		try {
			const nextDefinition = structuredClone(revisionState.draftDefinition);
			nextDefinition.allowedAgentToolIds = nextAllowedAgentToolIds;

			for (const block of nextDefinition.blocks) {
				if (block.kind !== 'agent') continue;
				if (!block.agentConfig.enabledToolIds?.length) continue;

				const filteredToolIds = block.agentConfig.enabledToolIds.filter((toolId) =>
					allowedToolIds.has(toolId)
				);

				block.agentConfig.enabledToolIds =
					filteredToolIds.length === 0 || filteredToolIds.length === allowedToolIds.size
						? undefined
						: filteredToolIds;
			}

			const validatedDefinition = LessonService.validateAuthoringDraft(nextDefinition);
			await persistDefinition({
				ilid: params.ilid,
				definition: validatedDefinition,
				userId: user.id
			});

			return {
				success: true,
				action: 'updateAgentPolicy',
				message:
					'Política agéntica guardada. Los subconjuntos por bloque se ajustaron si hacía falta.'
			};
		} catch (errorValue) {
			return asLessonError(errorValue, 'updateAgentPolicy');
		}
	},

	reorderBlocks: async ({ request, params, locals }) => {
		const { user } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const revisionState = await LessonRevisionService.ensureLessonRevisionState(params.ilid, {
			actorUserId: user.id
		});
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
			const nextDefinition = LessonService.moveBlockDraft(
				revisionState.draftDefinition,
				blockId,
				direction
			);
			await persistDefinition({
				ilid: params.ilid,
				definition: nextDefinition,
				userId: user.id
			});
			return { success: true, action: 'reorderBlocks' };
		} catch (errorValue) {
			return asLessonError(errorValue, 'reorderBlocks');
		}
	},

	deleteBlock: async ({ request, params, locals }) => {
		const { user } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const revisionState = await LessonRevisionService.ensureLessonRevisionState(params.ilid, {
			actorUserId: user.id
		});
		const formData = await request.formData();
		const blockId = formData.get('blockId')?.toString().trim();

		if (!blockId) {
			return fail(400, {
				action: 'deleteBlock',
				error: 'No se indicó el bloque a eliminar.'
			});
		}

		try {
			const nextDefinition = LessonService.deleteBlockDraft(revisionState.draftDefinition, blockId);
			await persistDefinition({
				ilid: params.ilid,
				definition: nextDefinition,
				userId: user.id
			});
			return { success: true, action: 'deleteBlock' };
		} catch (errorValue) {
			return asLessonError(errorValue, 'deleteBlock');
		}
	},

	setEntryBlock: async ({ request, params, locals }) => {
		const { user } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		const revisionState = await LessonRevisionService.ensureLessonRevisionState(params.ilid, {
			actorUserId: user.id
		});
		const formData = await request.formData();
		const blockId = formData.get('blockId')?.toString().trim();

		if (!blockId) {
			return fail(400, {
				action: 'setEntryBlock',
				error: 'No se indicó el bloque de entrada.'
			});
		}

		try {
			const nextDefinition = LessonService.setEntryBlockDraft(
				revisionState.draftDefinition,
				blockId
			);
			await persistDefinition({
				ilid: params.ilid,
				definition: nextDefinition,
				userId: user.id
			});
			return { success: true, action: 'setEntryBlock' };
		} catch (errorValue) {
			return asLessonError(errorValue, 'setEntryBlock');
		}
	},

	publishDraft: async ({ params, locals }) => {
		const { user } = await requireLessonAdminContext(params.cid, params.ilid, locals);

		try {
			await LessonRevisionService.publishDraftRevision({
				interactiveLearningId: params.ilid,
				actorUserId: user.id
			});

			return {
				success: true,
				action: 'publishDraft',
				message: 'Borrador publicado. Los intentos nuevos ya usarán la revisión vigente.'
			};
		} catch (errorValue) {
			return asLessonError(errorValue, 'publishDraft');
		}
	},

	discardDraft: async ({ params, locals }) => {
		const { user } = await requireLessonAdminContext(params.cid, params.ilid, locals);
		await LessonRevisionService.discardDraftRevision({
			interactiveLearningId: params.ilid,
			actorUserId: user.id
		});

		return {
			success: true,
			action: 'discardDraft',
			message: 'Borrador descartado. El editor vuelve a reflejar la revisión publicada.'
		};
	}
} satisfies Actions;
