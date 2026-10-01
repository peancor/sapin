import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { learningActivityProgress, courseProgressSummary } from '$lib/server/db/schema';
import { eq, and, sql, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ROLE_LEVELS } from '$lib/server/roles';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (locals.user.highestRoleLevel < ROLE_LEVELS.SUPER_ADMIN)
		return new Response('Forbidden', { status: 403 });

	const body = await request.json().catch(() => null);
	const mode = body?.mode;
	if (mode !== 'preview' && mode !== 'execute')
		return json({ error: 'Parámetro "mode" inválido.' }, { status: 400 });

	// Obtener combinaciones únicas usuario-curso con actividad registrada
	const pairs = await db
		.selectDistinct({
			userId: learningActivityProgress.userId,
			courseId: learningActivityProgress.courseId
		})
		.from(learningActivityProgress)
		.all();

	if (mode === 'preview') {
		return json({ pairsToRebuild: pairs.length });
	}

	// Borrar y recalcular todos los summaries
	await db.delete(courseProgressSummary);

	let rebuilt = 0;

	for (const { userId, courseId } of pairs) {
		const [stats] = await db
			.select({
				completedActivities: sql<number>`SUM(CASE WHEN ${learningActivityProgress.status} = 'completed' THEN 1 ELSE 0 END)`,
				inProgressActivities: sql<number>`SUM(CASE WHEN ${learningActivityProgress.status} = 'in_progress' THEN 1 ELSE 0 END)`,
				totalActivities: count(),
				totalTimeSpentSeconds: sql<number>`SUM(${learningActivityProgress.timeSpentSeconds})`,
				lastActivityAt: sql<number>`MAX(${learningActivityProgress.lastInteractionAt})`
			})
			.from(learningActivityProgress)
			.where(
				and(
					eq(learningActivityProgress.userId, userId),
					eq(learningActivityProgress.courseId, courseId)
				)
			);

		const completed = stats.completedActivities ?? 0;
		const total = stats.totalActivities ?? 0;
		const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

		const now = new Date();
		await db.insert(courseProgressSummary).values({
			id: nanoid(),
			userId,
			courseId,
			completedActivities: completed,
			inProgressActivities: stats.inProgressActivities ?? 0,
			completionRate,
			totalTimeSpentSeconds: stats.totalTimeSpentSeconds ?? 0,
			lastActivityAt: stats.lastActivityAt ? new Date(stats.lastActivityAt) : null,
			metadataJson: null,
			createdAt: now,
			updatedAt: now
		});

		rebuilt++;
	}

	return json({ rebuilt });
};
