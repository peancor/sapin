/**
 * Script de Agregación y Limpieza de Analytics
 *
 * Este módulo proporciona funciones para:
 * 1. Agregar estadísticas diarias
 * 2. Limpiar eventos antiguos según la retención configurada
 * 3. Marcar sesiones inactivas como terminadas
 *
 * Puede ejecutarse como cron job o al inicio del servidor.
 */

import { db } from '$lib/server/db';
import {
	analyticsSession,
	analyticsEvent,
	analyticsDailyStats,
	appSetting
} from '$lib/server/db/schema';
import { eq, lte, and, lt, sql, count, countDistinct, isNotNull, gte } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// ============================================
// CONFIGURACIÓN
// ============================================

async function getSetting(key: string, defaultValue: string = ''): Promise<string> {
	const result = await db.select().from(appSetting).where(eq(appSetting.key, key));
	return result[0]?.value ?? defaultValue;
}

async function getRetentionDays(): Promise<number> {
	const value = await getSetting('analyticsRetentionDays', '90');
	return parseInt(value, 10) || 90;
}

async function isAnalyticsEnabled(): Promise<boolean> {
	const value = await getSetting('analyticsEnabled', 'false');
	return value === 'true';
}

// ============================================
// LIMPIEZA DE SESIONES INACTIVAS
// ============================================

/**
 * Marca como terminadas las sesiones que llevan más de 30 minutos sin actividad
 */
export async function closeInactiveSessions(): Promise<number> {
	const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

	// Encontrar sesiones activas sin eventos recientes
	const inactiveSessions = await db
		.select({
			id: analyticsSession.id,
			startedAt: analyticsSession.startedAt
		})
		.from(analyticsSession)
		.where(
			and(eq(analyticsSession.isActive, true), lt(analyticsSession.startedAt, thirtyMinutesAgo))
		);

	let closedCount = 0;

	for (const session of inactiveSessions) {
		// Verificar si tiene eventos recientes
		const recentEvent = await db
			.select({ createdAt: analyticsEvent.createdAt })
			.from(analyticsEvent)
			.where(
				and(
					eq(analyticsEvent.sessionId, session.id),
					gte(analyticsEvent.createdAt, thirtyMinutesAgo)
				)
			)
			.limit(1);

		if (recentEvent.length === 0) {
			// Obtener el último evento para calcular duración
			const lastEvent = await db
				.select({ createdAt: analyticsEvent.createdAt })
				.from(analyticsEvent)
				.where(eq(analyticsEvent.sessionId, session.id))
				.orderBy(sql`${analyticsEvent.createdAt} DESC`)
				.limit(1);

			const endTime = lastEvent[0]?.createdAt || session.startedAt;
			const duration = Math.round((endTime.getTime() - session.startedAt.getTime()) / 1000);

			await db
				.update(analyticsSession)
				.set({
					isActive: false,
					endedAt: endTime,
					duration
				})
				.where(eq(analyticsSession.id, session.id));

			closedCount++;
		}
	}

	return closedCount;
}

// ============================================
// LIMPIEZA DE DATOS ANTIGUOS
// ============================================

/**
 * Elimina eventos y sesiones más antiguos que los días de retención configurados
 */
export async function cleanupOldData(): Promise<{
	deletedEvents: number;
	deletedSessions: number;
}> {
	const retentionDays = await getRetentionDays();
	const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

	console.log(`[Analytics Cleanup] Eliminando datos anteriores a ${cutoffDate.toISOString()}`);

	// Eliminar eventos antiguos
	const deletedEvents = await db
		.delete(analyticsEvent)
		.where(lte(analyticsEvent.createdAt, cutoffDate));

	// Eliminar sesiones antiguas (los eventos se eliminan en cascada)
	const deletedSessions = await db
		.delete(analyticsSession)
		.where(lte(analyticsSession.startedAt, cutoffDate));

	console.log(
		`[Analytics Cleanup] Eliminados: ${deletedEvents.changes} eventos, ${deletedSessions.changes} sesiones`
	);

	return {
		deletedEvents: deletedEvents.changes,
		deletedSessions: deletedSessions.changes
	};
}

// ============================================
// AGREGACIÓN DIARIA
// ============================================

/**
 * Agrega estadísticas para un día específico
 */
export async function aggregateDay(date: Date): Promise<void> {
	const dateStr = date.toISOString().split('T')[0];
	const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

	console.log(`[Analytics Aggregation] Agregando datos para ${dateStr}`);

	// Visitantes únicos
	const visitors = await db
		.select({ count: countDistinct(analyticsEvent.visitorId) })
		.from(analyticsEvent)
		.where(and(gte(analyticsEvent.createdAt, dayStart), lt(analyticsEvent.createdAt, dayEnd)));

	// Usuarios únicos autenticados
	const users = await db
		.select({ count: countDistinct(analyticsEvent.userId) })
		.from(analyticsEvent)
		.where(
			and(
				gte(analyticsEvent.createdAt, dayStart),
				lt(analyticsEvent.createdAt, dayEnd),
				isNotNull(analyticsEvent.userId)
			)
		);

	// Sesiones totales
	const sessions = await db
		.select({ count: count() })
		.from(analyticsSession)
		.where(and(gte(analyticsSession.startedAt, dayStart), lt(analyticsSession.startedAt, dayEnd)));

	// Page views
	const pageViews = await db
		.select({ count: count() })
		.from(analyticsEvent)
		.where(
			and(
				gte(analyticsEvent.createdAt, dayStart),
				lt(analyticsEvent.createdAt, dayEnd),
				eq(analyticsEvent.type, 'page_view')
			)
		);

	// Duración media de sesión
	const avgDuration = await db
		.select({ avg: sql<number>`AVG(${analyticsSession.duration})` })
		.from(analyticsSession)
		.where(
			and(
				gte(analyticsSession.startedAt, dayStart),
				lt(analyticsSession.startedAt, dayEnd),
				isNotNull(analyticsSession.duration)
			)
		);

	// Bounce rate
	const bounceQuery = await db
		.select({
			total: count(),
			bounced: sql<number>`SUM(CASE WHEN ${analyticsSession.pageViews} <= 1 THEN 1 ELSE 0 END)`
		})
		.from(analyticsSession)
		.where(and(gte(analyticsSession.startedAt, dayStart), lt(analyticsSession.startedAt, dayEnd)));

	const bounceRate =
		bounceQuery[0]?.total > 0 ? (bounceQuery[0].bounced / bounceQuery[0].total) * 100 : 0;

	// Top pages
	const topPages = await db
		.select({
			path: analyticsEvent.path,
			views: count()
		})
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
		.limit(10);

	// Device breakdown
	const deviceBreakdown = await db
		.select({
			device: analyticsSession.device,
			count: count()
		})
		.from(analyticsSession)
		.where(
			and(
				gte(analyticsSession.startedAt, dayStart),
				lt(analyticsSession.startedAt, dayEnd),
				isNotNull(analyticsSession.device)
			)
		)
		.groupBy(analyticsSession.device);

	// Browser breakdown
	const browserBreakdown = await db
		.select({
			browser: analyticsSession.browser,
			count: count()
		})
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
		.limit(5);

	// Hourly activity
	const hourlyActivity = await db
		.select({
			hour: sql<number>`CAST(strftime('%H', ${analyticsEvent.createdAt} / 1000, 'unixepoch') AS INTEGER)`,
			count: count()
		})
		.from(analyticsEvent)
		.where(
			and(
				gte(analyticsEvent.createdAt, dayStart),
				lt(analyticsEvent.createdAt, dayEnd),
				eq(analyticsEvent.type, 'page_view')
			)
		)
		.groupBy(sql`strftime('%H', ${analyticsEvent.createdAt} / 1000, 'unixepoch')`);

	const hourlyArray = new Array(24).fill(0);
	hourlyActivity.forEach((h) => {
		if (h.hour >= 0 && h.hour < 24) {
			hourlyArray[h.hour] = h.count;
		}
	});

	// Preparar registro
	const record = {
		uniqueVisitors: visitors[0]?.count || 0,
		uniqueUsers: users[0]?.count || 0,
		totalSessions: sessions[0]?.count || 0,
		totalPageViews: pageViews[0]?.count || 0,
		avgSessionDuration: Math.round(avgDuration[0]?.avg || 0),
		bounceRate: Math.round(bounceRate * 10) / 10,
		topPages: JSON.stringify(topPages.map((p) => ({ path: p.path, views: p.views }))),
		topReferrers: JSON.stringify([]),
		deviceBreakdown: JSON.stringify(
			deviceBreakdown.reduce(
				(acc, d) => {
					acc[d.device || 'unknown'] = d.count;
					return acc;
				},
				{} as Record<string, number>
			)
		),
		browserBreakdown: JSON.stringify(
			browserBreakdown.map((b) => ({ browser: b.browser, count: b.count }))
		),
		newVsReturning: JSON.stringify({ new: 0, returning: 0 }),
		hourlyActivity: JSON.stringify(hourlyArray),
		updatedAt: new Date()
	};

	// Insertar o actualizar
	const existing = await db
		.select()
		.from(analyticsDailyStats)
		.where(eq(analyticsDailyStats.date, dateStr));

	if (existing.length > 0) {
		await db.update(analyticsDailyStats).set(record).where(eq(analyticsDailyStats.date, dateStr));
	} else {
		await db.insert(analyticsDailyStats).values({
			id: `ads_${nanoid()}`,
			date: dateStr,
			...record,
			createdAt: new Date()
		});
	}

	console.log(`[Analytics Aggregation] Completado para ${dateStr}`);
}

/**
 * Agrega estadísticas de ayer (uso típico en cron diario)
 */
export async function aggregateYesterday(): Promise<void> {
	const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
	await aggregateDay(yesterday);
}

/**
 * Agrega estadísticas de los últimos N días
 */
export async function aggregateLastDays(days: number): Promise<void> {
	for (let i = days; i >= 1; i--) {
		const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
		await aggregateDay(date);
	}
}

// ============================================
// EJECUCIÓN COMPLETA
// ============================================

/**
 * Ejecuta todas las tareas de mantenimiento de analytics
 */
export async function runMaintenance(): Promise<{
	sessionssClosed: number;
	eventsDeleted: number;
	sessionsDeleted: number;
}> {
	const enabled = await isAnalyticsEnabled();

	if (!enabled) {
		console.log('[Analytics Maintenance] Sistema deshabilitado, saltando mantenimiento');
		return { sessionssClosed: 0, eventsDeleted: 0, sessionsDeleted: 0 };
	}

	console.log('[Analytics Maintenance] Iniciando mantenimiento...');

	// 1. Cerrar sesiones inactivas
	const sessionsClosed = await closeInactiveSessions();
	console.log(`[Analytics Maintenance] Sesiones cerradas: ${sessionsClosed}`);

	// 2. Agregar estadísticas de ayer
	await aggregateYesterday();

	// 3. Limpiar datos antiguos
	const { deletedEvents, deletedSessions } = await cleanupOldData();

	console.log('[Analytics Maintenance] Mantenimiento completado');

	return {
		sessionssClosed: sessionsClosed,
		eventsDeleted: deletedEvents,
		sessionsDeleted: deletedSessions
	};
}

export default {
	closeInactiveSessions,
	cleanupOldData,
	aggregateDay,
	aggregateYesterday,
	aggregateLastDays,
	runMaintenance
};
