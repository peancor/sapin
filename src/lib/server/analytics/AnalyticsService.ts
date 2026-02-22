import { db } from '$lib/server/db';
import {
	analyticsSession,
	analyticsEvent,
	analyticsDailyStats,
	appSetting,
	analyticsEventType,
	user,
	role,
	userRoleAssignment
} from '$lib/server/db/schema';
import {
	eq,
	and,
	gte,
	lte,
	desc,
	sql,
	count,
	countDistinct,
	isNotNull,
	like,
	or,
	asc
} from 'drizzle-orm';
import { nanoid } from 'nanoid';

// ============================================
// TIPOS
// ============================================

export interface AnalyticsConfig {
	enabled: boolean;
	trackPageViews: boolean;
	trackSessions: boolean;
	retentionDays: number;
}

export interface EventPayload {
	type: (typeof analyticsEventType)[keyof typeof analyticsEventType];
	name: string;
	path?: string;
	title?: string;
	referrer?: string;
	duration?: number;
	metadata?: Record<string, unknown>;
}

export interface SessionPayload {
	visitorId: string;
	userId?: string;
	device?: string;
	browser?: string;
	os?: string;
	screenResolution?: string;
	language?: string;
	referrer?: string;
	utmSource?: string;
	utmMedium?: string;
	utmCampaign?: string;
}

export interface BatchEventPayload {
	sessionId: string;
	visitorId: string;
	userId?: string;
	events: EventPayload[];
}

export interface RealtimeStats {
	activeUsers: number;
	activeSessions: number;
	currentPages: { path: string; count: number; title?: string }[];
	eventsPerMinute: number;
	timestamp: number;
}

export interface DashboardStats {
	today: {
		uniqueVisitors: number;
		uniqueUsers: number;
		pageViews: number;
		sessions: number;
		avgSessionDuration: number;
		bounceRate: number;
	};
	comparison: {
		visitorsChange: number;
		pageViewsChange: number;
		sessionsChange: number;
	};
	charts: {
		visitorsOverTime: { date: string; visitors: number; pageViews: number }[];
		topPages: { path: string; views: number }[];
		deviceBreakdown: { device: string; count: number }[];
		hourlyActivity: number[];
		browserBreakdown: { browser: string; count: number }[];
	};
}

// ============================================
// CONFIGURACIÓN
// ============================================

const DEFAULT_CONFIG: AnalyticsConfig = {
	enabled: false,
	trackPageViews: true,
	trackSessions: true,
	retentionDays: 90
};

const ANALYTICS_CONFIG_KEY = 'analyticsConfig';

// Cache simple para evitar consultas repetidas
let configCache: AnalyticsConfig | null = null;
let configCacheTime: number = 0;
const CACHE_TTL = 60000; // 1 minuto

export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
	// Cache simple para evitar consultas repetidas
	if (configCache && Date.now() - configCacheTime < CACHE_TTL) {
		return configCache;
	}

	try {
		const result = await db
			.select()
			.from(appSetting)
			.where(eq(appSetting.key, ANALYTICS_CONFIG_KEY));

		if (result[0]?.value) {
			configCache = JSON.parse(result[0].value) as AnalyticsConfig;
		} else {
			configCache = DEFAULT_CONFIG;
		}

		configCacheTime = Date.now();
		return configCache;
	} catch (error) {
		console.error('Error loading analytics config:', error);
		return DEFAULT_CONFIG;
	}
}

export async function saveAnalyticsConfig(config: Partial<AnalyticsConfig>): Promise<void> {
	// Merge con config existente
	const currentConfig = await getAnalyticsConfig();
	const newConfig = { ...currentConfig, ...config };

	const configJson = JSON.stringify(newConfig);

	const existing = await db
		.select()
		.from(appSetting)
		.where(eq(appSetting.key, ANALYTICS_CONFIG_KEY));

	if (existing.length > 0) {
		await db
			.update(appSetting)
			.set({ value: configJson })
			.where(eq(appSetting.key, ANALYTICS_CONFIG_KEY));
	} else {
		await db.insert(appSetting).values({
			id: nanoid(),
			key: ANALYTICS_CONFIG_KEY,
			value: configJson,
			createdAt: new Date()
		});
	}

	// Invalidar cache
	configCache = null;
}

// ============================================
// SESIONES
// ============================================

export async function createSession(payload: SessionPayload): Promise<string> {
	const config = await getAnalyticsConfig();
	if (!config.enabled || !config.trackSessions) {
		return ''; // Retornar vacío si está deshabilitado
	}

	const id = `as_${nanoid()}`;
	const now = new Date();

	await db.insert(analyticsSession).values({
		id,
		visitorId: payload.visitorId,
		userId: payload.userId || null,
		startedAt: now,
		pageViews: 0,
		device: payload.device || null,
		browser: payload.browser || null,
		os: payload.os || null,
		screenResolution: payload.screenResolution || null,
		language: payload.language || null,
		referrer: payload.referrer || null,
		utmSource: payload.utmSource || null,
		utmMedium: payload.utmMedium || null,
		utmCampaign: payload.utmCampaign || null,
		isActive: true
	});

	return id;
}

export async function updateSession(
	sessionId: string,
	updates: { pageViews?: number; duration?: number; endedAt?: Date; isActive?: boolean }
): Promise<void> {
	if (!sessionId) return;

	await db.update(analyticsSession).set(updates).where(eq(analyticsSession.id, sessionId));
}

export async function endSession(sessionId: string, duration: number): Promise<void> {
	if (!sessionId) return;

	await db
		.update(analyticsSession)
		.set({
			endedAt: new Date(),
			duration,
			isActive: false
		})
		.where(eq(analyticsSession.id, sessionId));
}

// ============================================
// EVENTOS
// ============================================

export async function recordEvents(payload: BatchEventPayload): Promise<void> {
	const config = await getAnalyticsConfig();
	if (!config.enabled) {
		return; // No registrar si está deshabilitado
	}

	const now = new Date();
	const events = payload.events.map((event) => ({
		id: `ae_${nanoid()}`,
		sessionId: payload.sessionId || null,
		visitorId: payload.visitorId,
		userId: payload.userId || null,
		type: event.type,
		name: event.name,
		path: event.path || null,
		title: event.title || null,
		referrer: event.referrer || null,
		duration: event.duration || null,
		metadata: event.metadata ? JSON.stringify(event.metadata) : null,
		createdAt: now
	}));

	if (events.length > 0) {
		await db.insert(analyticsEvent).values(events);

		// Actualizar contador de pageViews en la sesión
		if (payload.sessionId) {
			const pageViewCount = events.filter((e) => e.type === 'page_view').length;
			if (pageViewCount > 0) {
				await db
					.update(analyticsSession)
					.set({
						pageViews: sql`${analyticsSession.pageViews} + ${pageViewCount}`
					})
					.where(eq(analyticsSession.id, payload.sessionId));
			}
		}
	}
}

// ============================================
// ESTADÍSTICAS EN TIEMPO REAL
// ============================================

export async function getRealtimeStats(): Promise<RealtimeStats> {
	const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
	const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

	// Usuarios activos (con eventos en los últimos 5 minutos)
	const activeVisitors = await db
		.select({ count: countDistinct(analyticsEvent.visitorId) })
		.from(analyticsEvent)
		.where(gte(analyticsEvent.createdAt, fiveMinutesAgo));

	// Sesiones activas
	const activeSessions = await db
		.select({ count: count() })
		.from(analyticsSession)
		.where(eq(analyticsSession.isActive, true));

	// Páginas actuales (últimos 5 minutos)
	const currentPages = await db
		.select({
			path: analyticsEvent.path,
			title: analyticsEvent.title,
			count: count()
		})
		.from(analyticsEvent)
		.where(
			and(
				gte(analyticsEvent.createdAt, fiveMinutesAgo),
				eq(analyticsEvent.type, 'page_view'),
				isNotNull(analyticsEvent.path)
			)
		)
		.groupBy(analyticsEvent.path, analyticsEvent.title)
		.orderBy(desc(count()))
		.limit(10);

	// Eventos por minuto
	const eventsLastMinute = await db
		.select({ count: count() })
		.from(analyticsEvent)
		.where(gte(analyticsEvent.createdAt, oneMinuteAgo));

	return {
		activeUsers: activeVisitors[0]?.count || 0,
		activeSessions: activeSessions[0]?.count || 0,
		currentPages: currentPages.map((p) => ({
			path: p.path || '/',
			count: p.count,
			title: p.title || undefined
		})),
		eventsPerMinute: eventsLastMinute[0]?.count || 0,
		timestamp: Date.now()
	};
}

// ============================================
// ESTADÍSTICAS DEL DASHBOARD
// ============================================

export async function getDashboardStats(
	period: 'day' | 'week' | 'month' = 'week'
): Promise<DashboardStats> {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

	let periodStart: Date;
	let previousPeriodStart: Date;

	switch (period) {
		case 'day':
			periodStart = today;
			previousPeriodStart = yesterday;
			break;
		case 'week':
			periodStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
			previousPeriodStart = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
			break;
		case 'month':
			periodStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
			previousPeriodStart = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
			break;
	}

	// Estadísticas de hoy
	const todayStats = await getTodayStats(today);

	// Comparación con período anterior
	const comparison = await getComparisonStats(periodStart, previousPeriodStart, today);

	// Datos para gráficos
	const charts = await getChartData(periodStart, today);

	return {
		today: todayStats,
		comparison,
		charts
	};
}

async function getTodayStats(today: Date) {
	const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

	const [visitors, users, pageViews, sessions, avgDuration] = await Promise.all([
		db
			.select({ count: countDistinct(analyticsEvent.visitorId) })
			.from(analyticsEvent)
			.where(and(gte(analyticsEvent.createdAt, today), lte(analyticsEvent.createdAt, tomorrow))),

		db
			.select({ count: countDistinct(analyticsEvent.userId) })
			.from(analyticsEvent)
			.where(
				and(
					gte(analyticsEvent.createdAt, today),
					lte(analyticsEvent.createdAt, tomorrow),
					isNotNull(analyticsEvent.userId)
				)
			),

		db
			.select({ count: count() })
			.from(analyticsEvent)
			.where(
				and(
					gte(analyticsEvent.createdAt, today),
					lte(analyticsEvent.createdAt, tomorrow),
					eq(analyticsEvent.type, 'page_view')
				)
			),

		db
			.select({ count: count() })
			.from(analyticsSession)
			.where(
				and(gte(analyticsSession.startedAt, today), lte(analyticsSession.startedAt, tomorrow))
			),

		db
			.select({ avg: sql<number>`AVG(${analyticsSession.duration})` })
			.from(analyticsSession)
			.where(
				and(
					gte(analyticsSession.startedAt, today),
					lte(analyticsSession.startedAt, tomorrow),
					isNotNull(analyticsSession.duration)
				)
			)
	]);

	// Calcular bounce rate (sesiones con solo 1 pageview)
	const bounceQuery = await db
		.select({
			total: count(),
			bounced: sql<number>`SUM(CASE WHEN ${analyticsSession.pageViews} <= 1 THEN 1 ELSE 0 END)`
		})
		.from(analyticsSession)
		.where(and(gte(analyticsSession.startedAt, today), lte(analyticsSession.startedAt, tomorrow)));

	const bounceRate =
		bounceQuery[0]?.total > 0 ? (bounceQuery[0].bounced / bounceQuery[0].total) * 100 : 0;

	return {
		uniqueVisitors: visitors[0]?.count || 0,
		uniqueUsers: users[0]?.count || 0,
		pageViews: pageViews[0]?.count || 0,
		sessions: sessions[0]?.count || 0,
		avgSessionDuration: Math.round(avgDuration[0]?.avg || 0),
		bounceRate: Math.round(bounceRate * 10) / 10
	};
}

async function getComparisonStats(periodStart: Date, previousPeriodStart: Date, today: Date) {
	const [currentVisitors, previousVisitors] = await Promise.all([
		db
			.select({ count: countDistinct(analyticsEvent.visitorId) })
			.from(analyticsEvent)
			.where(and(gte(analyticsEvent.createdAt, periodStart), lte(analyticsEvent.createdAt, today))),
		db
			.select({ count: countDistinct(analyticsEvent.visitorId) })
			.from(analyticsEvent)
			.where(
				and(
					gte(analyticsEvent.createdAt, previousPeriodStart),
					lte(analyticsEvent.createdAt, periodStart)
				)
			)
	]);

	const [currentPageViews, previousPageViews] = await Promise.all([
		db
			.select({ count: count() })
			.from(analyticsEvent)
			.where(
				and(
					gte(analyticsEvent.createdAt, periodStart),
					lte(analyticsEvent.createdAt, today),
					eq(analyticsEvent.type, 'page_view')
				)
			),
		db
			.select({ count: count() })
			.from(analyticsEvent)
			.where(
				and(
					gte(analyticsEvent.createdAt, previousPeriodStart),
					lte(analyticsEvent.createdAt, periodStart),
					eq(analyticsEvent.type, 'page_view')
				)
			)
	]);

	const [currentSessions, previousSessions] = await Promise.all([
		db
			.select({ count: count() })
			.from(analyticsSession)
			.where(
				and(gte(analyticsSession.startedAt, periodStart), lte(analyticsSession.startedAt, today))
			),
		db
			.select({ count: count() })
			.from(analyticsSession)
			.where(
				and(
					gte(analyticsSession.startedAt, previousPeriodStart),
					lte(analyticsSession.startedAt, periodStart)
				)
			)
	]);

	const calcChange = (current: number, previous: number) => {
		if (previous === 0) return current > 0 ? 100 : 0;
		return Math.round(((current - previous) / previous) * 100);
	};

	return {
		visitorsChange: calcChange(currentVisitors[0]?.count || 0, previousVisitors[0]?.count || 0),
		pageViewsChange: calcChange(currentPageViews[0]?.count || 0, previousPageViews[0]?.count || 0),
		sessionsChange: calcChange(currentSessions[0]?.count || 0, previousSessions[0]?.count || 0)
	};
}

async function getChartData(periodStart: Date, today: Date) {
	// Visitantes por día
	const dailyVisitors = await db
		.select({
			date: sql<string>`DATE(${analyticsEvent.createdAt} / 1000, 'unixepoch')`,
			visitors: countDistinct(analyticsEvent.visitorId),
			pageViews: count()
		})
		.from(analyticsEvent)
		.where(
			and(
				gte(analyticsEvent.createdAt, periodStart),
				lte(analyticsEvent.createdAt, today),
				eq(analyticsEvent.type, 'page_view')
			)
		)
		.groupBy(sql`DATE(${analyticsEvent.createdAt} / 1000, 'unixepoch')`)
		.orderBy(sql`DATE(${analyticsEvent.createdAt} / 1000, 'unixepoch')`);

	// Top páginas
	const topPages = await db
		.select({
			path: analyticsEvent.path,
			views: count()
		})
		.from(analyticsEvent)
		.where(
			and(
				gte(analyticsEvent.createdAt, periodStart),
				lte(analyticsEvent.createdAt, today),
				eq(analyticsEvent.type, 'page_view'),
				isNotNull(analyticsEvent.path)
			)
		)
		.groupBy(analyticsEvent.path)
		.orderBy(desc(count()))
		.limit(10);

	// Distribución por dispositivo
	const deviceBreakdown = await db
		.select({
			device: analyticsSession.device,
			count: count()
		})
		.from(analyticsSession)
		.where(
			and(
				gte(analyticsSession.startedAt, periodStart),
				lte(analyticsSession.startedAt, today),
				isNotNull(analyticsSession.device)
			)
		)
		.groupBy(analyticsSession.device)
		.orderBy(desc(count()));

	// Distribución por navegador
	const browserBreakdown = await db
		.select({
			browser: analyticsSession.browser,
			count: count()
		})
		.from(analyticsSession)
		.where(
			and(
				gte(analyticsSession.startedAt, periodStart),
				lte(analyticsSession.startedAt, today),
				isNotNull(analyticsSession.browser)
			)
		)
		.groupBy(analyticsSession.browser)
		.orderBy(desc(count()))
		.limit(5);

	// Actividad por hora (hoy)
	const hourlyActivity = await db
		.select({
			hour: sql<number>`CAST(strftime('%H', ${analyticsEvent.createdAt} / 1000, 'unixepoch') AS INTEGER)`,
			count: count()
		})
		.from(analyticsEvent)
		.where(and(gte(analyticsEvent.createdAt, today), eq(analyticsEvent.type, 'page_view')))
		.groupBy(sql`strftime('%H', ${analyticsEvent.createdAt} / 1000, 'unixepoch')`);

	// Crear array de 24 horas con conteos
	const hourlyArray = new Array(24).fill(0);
	hourlyActivity.forEach((h) => {
		if (h.hour >= 0 && h.hour < 24) {
			hourlyArray[h.hour] = h.count;
		}
	});

	return {
		visitorsOverTime: dailyVisitors.map((d) => ({
			date: d.date,
			visitors: d.visitors,
			pageViews: d.pageViews
		})),
		topPages: topPages.map((p) => ({
			path: p.path || '/',
			views: p.views
		})),
		deviceBreakdown: deviceBreakdown.map((d) => ({
			device: d.device || 'unknown',
			count: d.count
		})),
		hourlyActivity: hourlyArray,
		browserBreakdown: browserBreakdown.map((b) => ({
			browser: b.browser || 'unknown',
			count: b.count
		}))
	};
}

// ============================================
// LIMPIEZA DE DATOS
// ============================================

export async function cleanupOldData(): Promise<{
	deletedEvents: number;
	deletedSessions: number;
}> {
	const config = await getAnalyticsConfig();
	const cutoffDate = new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000);

	// Eliminar eventos antiguos
	const deletedEvents = await db
		.delete(analyticsEvent)
		.where(lte(analyticsEvent.createdAt, cutoffDate));

	// Eliminar sesiones antiguas sin eventos
	const deletedSessions = await db
		.delete(analyticsSession)
		.where(lte(analyticsSession.startedAt, cutoffDate));

	return {
		deletedEvents: deletedEvents.changes,
		deletedSessions: deletedSessions.changes
	};
}

// ============================================
// AGREGACIÓN DIARIA
// ============================================

export async function aggregateDailyStats(date?: Date): Promise<void> {
	const targetDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000); // Ayer por defecto
	const dateStr = targetDate.toISOString().split('T')[0];
	const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
	const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

	// Obtener estadísticas del día
	const stats = await getTodayStats(dayStart);
	const charts = await getChartData(dayStart, dayEnd);

	// Buscar si ya existe registro para este día
	const existing = await db
		.select()
		.from(analyticsDailyStats)
		.where(eq(analyticsDailyStats.date, dateStr));

	const record = {
		uniqueVisitors: stats.uniqueVisitors,
		uniqueUsers: stats.uniqueUsers,
		totalSessions: stats.sessions,
		totalPageViews: stats.pageViews,
		avgSessionDuration: stats.avgSessionDuration,
		bounceRate: stats.bounceRate,
		topPages: JSON.stringify(charts.topPages),
		topReferrers: JSON.stringify([]), // TODO: implementar
		deviceBreakdown: JSON.stringify(charts.deviceBreakdown),
		browserBreakdown: JSON.stringify(charts.browserBreakdown),
		newVsReturning: JSON.stringify({ new: 0, returning: 0 }), // TODO: implementar
		hourlyActivity: JSON.stringify(charts.hourlyActivity),
		updatedAt: new Date()
	};

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
}

// ============================================
// ACTIVIDAD DE USUARIOS
// ============================================

export interface UserActivity {
	userId: string;
	email: string;
	username: string | null;
	alias: string | null;
	image: string | null;
	lastSeen: Date;
	totalSessions: number;
	totalPageViews: number;
	totalDuration: number;
	lastPath: string | null;
	device: string | null;
	browser: string | null;
}

export interface RecentEvent {
	id: string;
	type: string;
	name: string;
	path: string | null;
	title: string | null;
	userId: string | null;
	userEmail: string | null;
	userName: string | null;
	visitorId: string;
	createdAt: Date;
	metadata: Record<string, unknown> | null;
}

export interface UserActivityDetail {
	user: {
		id: string;
		email: string;
		username: string | null;
		alias: string | null;
		image: string | null;
		roles: string[];
		createdAt: Date;
	};
	stats: {
		totalSessions: number;
		totalPageViews: number;
		totalDuration: number;
		avgSessionDuration: number;
		firstSeen: Date | null;
		lastSeen: Date | null;
	};
	recentSessions: {
		id: string;
		startedAt: Date;
		endedAt: Date | null;
		duration: number | null;
		pageViews: number;
		device: string | null;
		browser: string | null;
		os: string | null;
	}[];
	recentEvents: RecentEvent[];
	topPages: { path: string; views: number }[];
	activityByDay: { date: string; pageViews: number }[];
}

/**
 * Obtiene la lista de usuarios activos con sus métricas
 */
export async function getActiveUsers(options: {
	period?: 'day' | 'week' | 'month';
	limit?: number;
	offset?: number;
	search?: string;
}): Promise<{ users: UserActivity[]; total: number }> {
	const { period = 'week', limit = 20, offset = 0, search } = options;

	const now = new Date();
	let periodStart: Date;

	switch (period) {
		case 'day':
			periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			break;
		case 'week':
			periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			break;
		case 'month':
			periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			break;
	}

	// Construir condiciones de búsqueda
	const searchConditions = search
		? or(
			like(user.email, `%${search}%`),
			like(user.username, `%${search}%`),
			like(user.alias, `%${search}%`)
		)
		: undefined;

	// Obtener usuarios con actividad en el período
	const usersWithActivity = await db
		.select({
			userId: user.id,
			email: user.email,
			username: user.username,
			alias: user.alias,
			image: user.image,
			lastSeen: sql<Date>`MAX(${analyticsEvent.createdAt})`,
			totalPageViews: sql<number>`COUNT(CASE WHEN ${analyticsEvent.type} = 'page_view' THEN 1 END)`,
			lastPath: sql<string>`(
				SELECT ${analyticsEvent.path} 
				FROM ${analyticsEvent} AS e2 
				WHERE e2.user_id = ${user.id} 
				ORDER BY e2.created_at DESC 
				LIMIT 1
			)`
		})
		.from(user)
		.innerJoin(analyticsEvent, eq(analyticsEvent.userId, user.id))
		.where(and(gte(analyticsEvent.createdAt, periodStart), searchConditions))
		.groupBy(user.id)
		.orderBy(desc(sql`MAX(${analyticsEvent.createdAt})`))
		.limit(limit)
		.offset(offset);

	// Obtener conteo total
	const totalQuery = await db
		.select({ count: countDistinct(analyticsEvent.userId) })
		.from(analyticsEvent)
		.innerJoin(user, eq(analyticsEvent.userId, user.id))
		.where(
			and(
				gte(analyticsEvent.createdAt, periodStart),
				isNotNull(analyticsEvent.userId),
				searchConditions
			)
		);

	// Obtener estadísticas de sesiones para cada usuario
	const userIds = usersWithActivity.map((u) => u.userId);

	const sessionStats =
		userIds.length > 0
			? await db
				.select({
					userId: analyticsSession.userId,
					totalSessions: count(),
					totalDuration: sql<number>`COALESCE(SUM(${analyticsSession.duration}), 0)`,
					device: sql<string>`(
				SELECT ${analyticsSession.device}
				FROM ${analyticsSession} AS s2
				WHERE s2.user_id = ${analyticsSession.userId}
				ORDER BY s2.started_at DESC
				LIMIT 1
			)`,
					browser: sql<string>`(
				SELECT ${analyticsSession.browser}
				FROM ${analyticsSession} AS s2
				WHERE s2.user_id = ${analyticsSession.userId}
				ORDER BY s2.started_at DESC
				LIMIT 1
			)`
				})
				.from(analyticsSession)
				.where(
					and(
						gte(analyticsSession.startedAt, periodStart),
						isNotNull(analyticsSession.userId),
						sql`${analyticsSession.userId} IN (${sql.raw(userIds.map((id) => `'${id}'`).join(','))})`
					)
				)
				.groupBy(analyticsSession.userId)
			: [];

	// Combinar datos
	const sessionStatsMap = new Map(sessionStats.map((s) => [s.userId, s]));

	const users: UserActivity[] = usersWithActivity.map((u) => {
		const sessionData = sessionStatsMap.get(u.userId);
		return {
			userId: u.userId,
			email: u.email,
			username: u.username,
			alias: u.alias,
			image: u.image,
			lastSeen: u.lastSeen,
			totalSessions: sessionData?.totalSessions || 0,
			totalPageViews: u.totalPageViews,
			totalDuration: sessionData?.totalDuration || 0,
			lastPath: u.lastPath,
			device: sessionData?.device || null,
			browser: sessionData?.browser || null
		};
	});

	return {
		users,
		total: totalQuery[0]?.count || 0
	};
}

/**
 * Obtiene los eventos recientes
 */
export async function getRecentEvents(options: {
	limit?: number;
	offset?: number;
	userId?: string;
	type?: string;
}): Promise<{ events: RecentEvent[]; total: number }> {
	const { limit = 50, offset = 0, userId, type } = options;

	const conditions = [
		userId ? eq(analyticsEvent.userId, userId) : undefined,
		type
			? eq(
				analyticsEvent.type,
				type as (typeof analyticsEventType)[keyof typeof analyticsEventType]
			)
			: undefined
	].filter(Boolean);

	const events = await db
		.select({
			id: analyticsEvent.id,
			type: analyticsEvent.type,
			name: analyticsEvent.name,
			path: analyticsEvent.path,
			title: analyticsEvent.title,
			userId: analyticsEvent.userId,
			userEmail: user.email,
			userName: user.username,
			visitorId: analyticsEvent.visitorId,
			createdAt: analyticsEvent.createdAt,
			metadata: analyticsEvent.metadata
		})
		.from(analyticsEvent)
		.leftJoin(user, eq(analyticsEvent.userId, user.id))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(analyticsEvent.createdAt))
		.limit(limit)
		.offset(offset);

	const totalQuery = await db
		.select({ count: count() })
		.from(analyticsEvent)
		.where(conditions.length > 0 ? and(...conditions) : undefined);

	return {
		events: events.map((e) => ({
			...e,
			metadata: e.metadata ? JSON.parse(e.metadata) : null
		})),
		total: totalQuery[0]?.count || 0
	};
}

/**
 * Obtiene el detalle de actividad de un usuario específico
 */
export async function getUserActivityDetail(userId: string): Promise<UserActivityDetail | null> {
	// Obtener datos del usuario
	const userData = await db.select().from(user).where(eq(user.id, userId)).limit(1);

	if (userData.length === 0) {
		return null;
	}

	const u = userData[0];

	// Estadísticas generales
	const [sessionStats, eventStats, firstLastSeen] = await Promise.all([
		db
			.select({
				totalSessions: count(),
				totalDuration: sql<number>`COALESCE(SUM(${analyticsSession.duration}), 0)`,
				avgDuration: sql<number>`COALESCE(AVG(${analyticsSession.duration}), 0)`
			})
			.from(analyticsSession)
			.where(eq(analyticsSession.userId, userId)),

		db
			.select({
				totalPageViews: sql<number>`COUNT(CASE WHEN ${analyticsEvent.type} = 'page_view' THEN 1 END)`
			})
			.from(analyticsEvent)
			.where(eq(analyticsEvent.userId, userId)),

		db
			.select({
				firstSeen: sql<Date>`MIN(${analyticsEvent.createdAt})`,
				lastSeen: sql<Date>`MAX(${analyticsEvent.createdAt})`
			})
			.from(analyticsEvent)
			.where(eq(analyticsEvent.userId, userId))
	]);

	// Obtener roles del usuario
	const userRoles = await db
		.select({ name: role.name })
		.from(userRoleAssignment)
		.innerJoin(role, eq(userRoleAssignment.roleId, role.id))
		.where(and(eq(userRoleAssignment.userId, userId), eq(userRoleAssignment.isActive, true)));

	// Sesiones recientes
	const recentSessions = await db
		.select({
			id: analyticsSession.id,
			startedAt: analyticsSession.startedAt,
			endedAt: analyticsSession.endedAt,
			duration: analyticsSession.duration,
			pageViews: analyticsSession.pageViews,
			device: analyticsSession.device,
			browser: analyticsSession.browser,
			os: analyticsSession.os
		})
		.from(analyticsSession)
		.where(eq(analyticsSession.userId, userId))
		.orderBy(desc(analyticsSession.startedAt))
		.limit(10);

	// Eventos recientes
	const { events: recentEvents } = await getRecentEvents({ userId, limit: 20 });

	// Top páginas visitadas
	const topPages = await db
		.select({
			path: analyticsEvent.path,
			views: count()
		})
		.from(analyticsEvent)
		.where(
			and(
				eq(analyticsEvent.userId, userId),
				eq(analyticsEvent.type, 'page_view'),
				isNotNull(analyticsEvent.path)
			)
		)
		.groupBy(analyticsEvent.path)
		.orderBy(desc(count()))
		.limit(10);

	// Actividad por día (últimos 30 días)
	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
	const activityByDay = await db
		.select({
			date: sql<string>`DATE(${analyticsEvent.createdAt} / 1000, 'unixepoch')`,
			pageViews: count()
		})
		.from(analyticsEvent)
		.where(
			and(
				eq(analyticsEvent.userId, userId),
				eq(analyticsEvent.type, 'page_view'),
				gte(analyticsEvent.createdAt, thirtyDaysAgo)
			)
		)
		.groupBy(sql`DATE(${analyticsEvent.createdAt} / 1000, 'unixepoch')`)
		.orderBy(asc(sql`DATE(${analyticsEvent.createdAt} / 1000, 'unixepoch')`));

	return {
		user: {
			id: u.id,
			email: u.email,
			username: u.username,
			alias: u.alias,
			image: u.image,
			roles: userRoles.map((r) => r.name),
			createdAt: u.createdAt
		},
		stats: {
			totalSessions: sessionStats[0]?.totalSessions || 0,
			totalPageViews: eventStats[0]?.totalPageViews || 0,
			totalDuration: sessionStats[0]?.totalDuration || 0,
			avgSessionDuration: Math.round(sessionStats[0]?.avgDuration || 0),
			firstSeen: firstLastSeen[0]?.firstSeen || null,
			lastSeen: firstLastSeen[0]?.lastSeen || null
		},
		recentSessions,
		recentEvents,
		topPages: topPages.map((p) => ({ path: p.path || '/', views: p.views })),
		activityByDay: activityByDay.map((d) => ({ date: d.date, pageViews: d.pageViews }))
	};
}

/**
 * Obtiene visitantes anónimos (sin usuario autenticado)
 */
export async function getAnonymousVisitors(options: {
	period?: 'day' | 'week' | 'month';
	limit?: number;
}): Promise<
	{
		visitorId: string;
		lastSeen: Date;
		totalPageViews: number;
		device: string | null;
		browser: string | null;
		lastPath: string | null;
	}[]
> {
	const { period = 'day', limit = 20 } = options;

	const now = new Date();
	let periodStart: Date;

	switch (period) {
		case 'day':
			periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			break;
		case 'week':
			periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			break;
		case 'month':
			periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			break;
	}

	const visitors = await db
		.select({
			visitorId: analyticsSession.visitorId,
			lastSeen: sql<Date>`MAX(${analyticsSession.startedAt})`,
			totalPageViews: sql<number>`SUM(${analyticsSession.pageViews})`,
			device: sql<string>`(
				SELECT ${analyticsSession.device}
				FROM ${analyticsSession} AS s2
				WHERE s2.visitor_id = ${analyticsSession.visitorId} AND s2.user_id IS NULL
				ORDER BY s2.started_at DESC
				LIMIT 1
			)`,
			browser: sql<string>`(
				SELECT ${analyticsSession.browser}
				FROM ${analyticsSession} AS s2
				WHERE s2.visitor_id = ${analyticsSession.visitorId} AND s2.user_id IS NULL
				ORDER BY s2.started_at DESC
				LIMIT 1
			)`
		})
		.from(analyticsSession)
		.where(
			and(gte(analyticsSession.startedAt, periodStart), sql`${analyticsSession.userId} IS NULL`)
		)
		.groupBy(analyticsSession.visitorId)
		.orderBy(desc(sql`MAX(${analyticsSession.startedAt})`))
		.limit(limit);

	// Obtener última página para cada visitante
	const result = await Promise.all(
		visitors.map(async (v) => {
			const lastEvent = await db
				.select({ path: analyticsEvent.path })
				.from(analyticsEvent)
				.where(and(eq(analyticsEvent.visitorId, v.visitorId), eq(analyticsEvent.type, 'page_view')))
				.orderBy(desc(analyticsEvent.createdAt))
				.limit(1);

			return {
				visitorId: v.visitorId,
				lastSeen: v.lastSeen,
				totalPageViews: v.totalPageViews || 0,
				device: v.device,
				browser: v.browser,
				lastPath: lastEvent[0]?.path || null
			};
		})
	);

	return result;
}

export default {
	getAnalyticsConfig,
	saveAnalyticsConfig,
	createSession,
	updateSession,
	endSession,
	recordEvents,
	getRealtimeStats,
	getDashboardStats,
	cleanupOldData,
	aggregateDailyStats,
	getActiveUsers,
	getRecentEvents,
	getUserActivityDetail,
	getAnonymousVisitors
};
