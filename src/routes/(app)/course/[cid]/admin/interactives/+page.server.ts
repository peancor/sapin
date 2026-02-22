import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { interactiveLearning, courseInteractiveLearning, interactiveLearningChat } from '$lib/server/db/schema';
import { eq, and, sql, count } from 'drizzle-orm';

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

	// Obtener conteo de participaciones por actividad (el id del chat ES el interactiveLearningId)
	const participationCounts = await db
		.select({
			interactiveLearningId: interactiveLearningChat.id,
			count: count()
		})
		.from(interactiveLearningChat)
		.where(
			sql`${interactiveLearningChat.id} IN (${sql.join(
				interactives.map((i) => sql`${i.id}`),
				sql`, `
			)})`
		)
		.groupBy(interactiveLearningChat.id);

	// Combinar datos
	const interactivesWithStats = interactives.map((interactive) => ({
		...interactive,
		participations: participationCounts.find((p) => p.interactiveLearningId === interactive.id)?.count || 0
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