import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { aiUsageLog, aiUsageDailyStats } from '$lib/server/db/schema';
import { eq, and, gte, lt, sql, count, countDistinct, isNotNull } from 'drizzle-orm';
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

	// Obtener los días distintos que existen en aiUsageLog
	const distinctDates = await db
		.selectDistinct({
			date: sql<string>`date(${aiUsageLog.createdAt} / 1000, 'unixepoch')`,
			modelId: aiUsageLog.modelId
		})
		.from(aiUsageLog)
		.all();

	if (mode === 'preview') {
		return json({ daysToRebuild: distinctDates.length });
	}

	// Eliminar todos los stats existentes y recalcular desde los logs
	await db.delete(aiUsageDailyStats);

	let rebuilt = 0;
	const processed = new Set<string>();

	for (const { date, modelId } of distinctDates) {
		const key = `${date}|${modelId}`;
		if (processed.has(key)) continue;
		processed.add(key);

		const dayStart = new Date(`${date}T00:00:00.000Z`);
		const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

		const [stats] = await db
			.select({
				totalRequests: count(),
				successfulRequests: sql<number>`SUM(CASE WHEN ${aiUsageLog.success} = 1 THEN 1 ELSE 0 END)`,
				failedRequests: sql<number>`SUM(CASE WHEN ${aiUsageLog.success} = 0 THEN 1 ELSE 0 END)`,
				totalInputTokens: sql<number>`SUM(${aiUsageLog.inputTokens})`,
				totalOutputTokens: sql<number>`SUM(${aiUsageLog.outputTokens})`,
				totalTokens: sql<number>`SUM(${aiUsageLog.totalTokens})`,
				totalCost: sql<number>`SUM(COALESCE(${aiUsageLog.estimatedCost}, 0))`,
				avgDurationMs: sql<number>`CAST(AVG(COALESCE(${aiUsageLog.durationMs}, 0)) AS INTEGER)`,
				uniqueUsers: countDistinct(aiUsageLog.userId)
			})
			.from(aiUsageLog)
			.where(
				and(
					eq(aiUsageLog.modelId, modelId),
					gte(aiUsageLog.createdAt, dayStart),
					lt(aiUsageLog.createdAt, dayEnd)
				)
			);

		const now = new Date();
		await db.insert(aiUsageDailyStats).values({
			id: nanoid(),
			date,
			modelId,
			totalRequests: stats.totalRequests ?? 0,
			successfulRequests: stats.successfulRequests ?? 0,
			failedRequests: stats.failedRequests ?? 0,
			totalInputTokens: stats.totalInputTokens ?? 0,
			totalOutputTokens: stats.totalOutputTokens ?? 0,
			totalTokens: stats.totalTokens ?? 0,
			totalCost: stats.totalCost ?? 0,
			avgDurationMs: stats.avgDurationMs ?? 0,
			uniqueUsers: stats.uniqueUsers ?? 0,
			createdAt: now,
			updatedAt: now
		});

		rebuilt++;
	}

	return json({ rebuilt });
};
