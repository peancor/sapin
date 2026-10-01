import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { analyticsEvent, analyticsSession, analyticsDailyStats } from '$lib/server/db/schema';
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

	// Días distintos con datos en analyticsEvent
	const distinctDates = await db
		.selectDistinct({
			date: sql<string>`date(${analyticsEvent.createdAt} / 1000, 'unixepoch')`
		})
		.from(analyticsEvent)
		.all();

	if (mode === 'preview') {
		return json({ daysToRebuild: distinctDates.length });
	}

	// Borrar y recalcular todos los stats
	await db.delete(analyticsDailyStats);

	let rebuilt = 0;

	for (const { date } of distinctDates) {
		const dayStart = new Date(`${date}T00:00:00.000Z`);
		const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

		const [visitors] = await db
			.select({ count: countDistinct(analyticsEvent.visitorId) })
			.from(analyticsEvent)
			.where(and(gte(analyticsEvent.createdAt, dayStart), lt(analyticsEvent.createdAt, dayEnd)));

		const [users] = await db
			.select({ count: countDistinct(analyticsEvent.userId) })
			.from(analyticsEvent)
			.where(
				and(
					gte(analyticsEvent.createdAt, dayStart),
					lt(analyticsEvent.createdAt, dayEnd),
					isNotNull(analyticsEvent.userId)
				)
			);

		const [sessions] = await db
			.select({ count: count() })
			.from(analyticsSession)
			.where(
				and(gte(analyticsSession.startedAt, dayStart), lt(analyticsSession.startedAt, dayEnd))
			);

		const [pageViews] = await db
			.select({ count: count() })
			.from(analyticsEvent)
			.where(
				and(
					gte(analyticsEvent.createdAt, dayStart),
					lt(analyticsEvent.createdAt, dayEnd),
					eq(analyticsEvent.type, 'page_view')
				)
			);

		const [avgDur] = await db
			.select({ avg: sql<number>`CAST(AVG(${analyticsSession.duration}) AS INTEGER)` })
			.from(analyticsSession)
			.where(
				and(
					gte(analyticsSession.startedAt, dayStart),
					lt(analyticsSession.startedAt, dayEnd),
					isNotNull(analyticsSession.duration)
				)
			);

		const [bounce] = await db
			.select({
				total: count(),
				bounced: sql<number>`SUM(CASE WHEN ${analyticsSession.pageViews} <= 1 THEN 1 ELSE 0 END)`
			})
			.from(analyticsSession)
			.where(
				and(gte(analyticsSession.startedAt, dayStart), lt(analyticsSession.startedAt, dayEnd))
			);

		const bounceRate = bounce.total > 0 ? (bounce.bounced / bounce.total) * 100 : 0;

		const topPages = await db
			.select({ path: analyticsEvent.path, views: count() })
			.from(analyticsEvent)
			.where(
				and(
					gte(analyticsEvent.createdAt, dayStart),
					lt(analyticsEvent.createdAt, dayEnd),
					eq(analyticsEvent.type, 'page_view'),
					isNotNull(analyticsEvent.path)
				)
			)
			.groupBy(analyticsEvent.path)
			.orderBy(sql`${count()} DESC`)
			.limit(10)
			.all();

		const deviceBreakdown = await db
			.select({ device: analyticsSession.device, count: count() })
			.from(analyticsSession)
			.where(
				and(
					gte(analyticsSession.startedAt, dayStart),
					lt(analyticsSession.startedAt, dayEnd),
					isNotNull(analyticsSession.device)
				)
			)
			.groupBy(analyticsSession.device)
			.all();

		const browserBreakdown = await db
			.select({ browser: analyticsSession.browser, count: count() })
			.from(analyticsSession)
			.where(
				and(
					gte(analyticsSession.startedAt, dayStart),
					lt(analyticsSession.startedAt, dayEnd),
					isNotNull(analyticsSession.browser)
				)
			)
			.groupBy(analyticsSession.browser)
			.orderBy(sql`${count()} DESC`)
			.limit(5)
			.all();

		const now = new Date();
		await db.insert(analyticsDailyStats).values({
			id: nanoid(),
			date,
			uniqueVisitors: visitors.count ?? 0,
			uniqueUsers: users.count ?? 0,
			totalSessions: sessions.count ?? 0,
			totalPageViews: pageViews.count ?? 0,
			avgSessionDuration: avgDur.avg ?? 0,
			bounceRate,
			topPages: JSON.stringify(topPages),
			topReferrers: null,
			deviceBreakdown: JSON.stringify(
				Object.fromEntries(deviceBreakdown.map((d) => [d.device ?? 'unknown', d.count]))
			),
			browserBreakdown: JSON.stringify(
				Object.fromEntries(browserBreakdown.map((b) => [b.browser ?? 'unknown', b.count]))
			),
			newVsReturning: null,
			hourlyActivity: null,
			createdAt: now,
			updatedAt: now
		});

		rebuilt++;
	}

	return json({ rebuilt });
};
