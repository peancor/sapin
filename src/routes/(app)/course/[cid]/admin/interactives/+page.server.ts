import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { interactiveLearning, courseInteractiveLearning, interactiveLearningChat, userInteractiveLearningChat, interactiveLessonSession } from '$lib/server/db/schema';
import { eq, and, sql, count, inArray } from 'drizzle-orm';

export const load = (async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Obtener actividades con orden
	const interactives = await db
		.select({
			id: interactiveLearning.id,
			name: interactiveLearning.name,
			slug: interactiveLearning.slug,
			description: interactiveLearning.description,
			type: interactiveLearning.type,
			status: interactiveLearning.status,
			order: courseInteractiveLearning.order,
			createdAt: interactiveLearning.createdAt
		})
		.from(interactiveLearning)
		.innerJoin(
			courseInteractiveLearning,
			and(
				eq(courseInteractiveLearning.interactiveLearningId, interactiveLearning.id),
				eq(courseInteractiveLearning.courseId, params.cid)
			)
		)
		.orderBy(courseInteractiveLearning.order);

	// Separar por tipo
	const chatIds = interactives.filter((i) => i.type === 'chat').map((i) => i.id);
	const agentIds = interactives.filter((i) => i.type === 'agent').map((i) => i.id);
	const lessonIds = interactives.filter((i) => i.type === 'lesson').map((i) => i.id);

	// Conteo de participaciones para actividades tipo chat (via interactiveLearningChat)
	const chatParticipationCounts =
		chatIds.length > 0
			? await db
					.select({
						interactiveLearningId: interactiveLearningChat.id,
						count: count()
					})
					.from(interactiveLearningChat)
					.where(inArray(interactiveLearningChat.id, chatIds))
					.groupBy(interactiveLearningChat.id)
			: [];

	// Conteo de participaciones para actividades tipo agent (via userInteractiveLearningChat)
	const agentParticipationCounts =
		agentIds.length > 0
			? await db
					.select({
						interactiveLearningId: userInteractiveLearningChat.interactiveLearningChatId,
						count: count()
					})
					.from(userInteractiveLearningChat)
					.where(inArray(userInteractiveLearningChat.interactiveLearningChatId, agentIds))
					.groupBy(userInteractiveLearningChat.interactiveLearningChatId)
			: [];

	const lessonParticipationCounts =
		lessonIds.length > 0
			? await db
					.select({
						interactiveLearningId: interactiveLessonSession.interactiveLearningId,
						count: count()
					})
					.from(interactiveLessonSession)
					.where(inArray(interactiveLessonSession.interactiveLearningId, lessonIds))
					.groupBy(interactiveLessonSession.interactiveLearningId)
			: [];

	const allParticipationCounts = [...chatParticipationCounts, ...agentParticipationCounts, ...lessonParticipationCounts];

	// Combinar datos
	const interactivesWithStats = interactives.map((interactive) => ({
		...interactive,
		participations: allParticipationCounts.find((p) => p.interactiveLearningId === interactive.id)?.count || 0
	}));

	return {
		interactives: interactivesWithStats,
		courseId: params.cid
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	deleteInteractive: async ({ request, params }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString();

		if (!id) {
			return fail(400, { message: 'ID requerido' });
		}

		try {
			// Eliminar la relación con el curso
			await db
				.delete(courseInteractiveLearning)
				.where(
					and(
						eq(courseInteractiveLearning.interactiveLearningId, id),
						eq(courseInteractiveLearning.courseId, params.cid)
					)
				);

			return { success: true };
		} catch (e) {
			console.error('Error eliminando actividad:', e);
			return fail(500, { message: 'Error eliminando actividad' });
		}
	},

	updateOrder: async ({ request, params }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString();
		const order = parseInt(formData.get('order')?.toString() || '0');

		if (!id) {
			return fail(400, { message: 'ID requerido' });
		}

		try {
			await db
				.update(courseInteractiveLearning)
				.set({ order })
				.where(
					and(
						eq(courseInteractiveLearning.interactiveLearningId, id),
						eq(courseInteractiveLearning.courseId, params.cid)
					)
				);

			return { success: true };
		} catch (e) {
			console.error('Error actualizando orden:', e);
			return fail(500, { message: 'Error actualizando orden' });
		}
	}
};
