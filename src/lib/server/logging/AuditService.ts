import { db } from '$lib/server/db';
import { auditLog, auditAction, auditSeverity, appSetting, user } from '$lib/server/db/schema';
import { eq, desc, and, gte, lte, like, or, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { logger } from './logger';

// ============================================
// TIPOS
// ============================================

export interface AuditConfig {
	enabled: boolean;
	retentionDays: number;
	categories: {
		user: boolean;
		course: boolean;
		settings: boolean;
		notifications: boolean;
		errors: boolean;
	};
}

export interface AuditEntry {
	action: string;
	userId?: string | null;
	targetType?: string | null;
	targetId?: string | null;
	details?: Record<string, unknown> | null;
	ipAddress?: string | null;
	userAgent?: string | null;
	severity?: (typeof auditSeverity)[keyof typeof auditSeverity];
}

export interface AuditLogRecord {
	id: string;
	timestamp: Date;
	action: string;
	userId: string | null;
	userEmail?: string | null;
	userName?: string | null;
	targetType: string | null;
	targetId: string | null;
	details: Record<string, unknown> | null;
	ipAddress: string | null;
	userAgent: string | null;
	severity: string | null;
}

export interface AuditQueryOptions {
	page?: number;
	limit?: number;
	action?: string;
	userId?: string;
	severity?: string;
	startDate?: Date;
	endDate?: Date;
	search?: string;
}

// ============================================
// CONFIGURACION POR DEFECTO
// ============================================

const DEFAULT_CONFIG: AuditConfig = {
	enabled: true,
	retentionDays: 90,
	categories: {
		user: true,
		course: true,
		settings: true,
		notifications: true,
		errors: true
	}
};

// ============================================
// HELPERS DE CONFIGURACION
// ============================================

async function getSetting(key: string, defaultValue: string = ''): Promise<string> {
	const result = await db.select().from(appSetting).where(eq(appSetting.key, key));
	return result[0]?.value ?? defaultValue;
}

async function saveSetting(key: string, value: string): Promise<void> {
	const existing = await db.select().from(appSetting).where(eq(appSetting.key, key));

	if (existing.length > 0) {
		await db.update(appSetting).set({ value }).where(eq(appSetting.key, key));
	} else {
		await db.insert(appSetting).values({
			id: nanoid(),
			key,
			value,
			createdAt: new Date()
		});
	}
}

// ============================================
// SERVICIO DE AUDITORIA
// ============================================

class AuditService {
	private configCache: AuditConfig | null = null;
	private configCacheTime: number = 0;
	private readonly CACHE_TTL = 60000; // 1 minuto

	/**
	 * Obtiene la configuracion del sistema de auditoria
	 */
	async getConfig(): Promise<AuditConfig> {
		// Cache simple para evitar consultas repetidas
		if (this.configCache && Date.now() - this.configCacheTime < this.CACHE_TTL) {
			return this.configCache;
		}

		try {
			const [enabled, retentionDays, categoriesJson] = await Promise.all([
				getSetting('auditEnabled', 'true'),
				getSetting('auditRetentionDays', '90'),
				getSetting('auditCategories', JSON.stringify(DEFAULT_CONFIG.categories))
			]);

			let categories = { ...DEFAULT_CONFIG.categories };
			try {
				const parsed = JSON.parse(categoriesJson);
				// Merge con defaults para incluir nuevas categorías
				categories = { ...DEFAULT_CONFIG.categories, ...parsed };
			} catch {
				// Usar default si falla el parse
			}

			this.configCache = {
				enabled: enabled === 'true',
				retentionDays: parseInt(retentionDays, 10) || 90,
				categories
			};
			this.configCacheTime = Date.now();

			return this.configCache;
		} catch (error) {
			logger.error({ error }, 'Error loading audit config, using defaults');
			return DEFAULT_CONFIG;
		}
	}

	/**
	 * Guarda la configuracion del sistema de auditoria
	 */
	async saveConfig(config: Partial<AuditConfig>): Promise<void> {
		const promises: Promise<void>[] = [];

		if (config.enabled !== undefined) {
			promises.push(saveSetting('auditEnabled', String(config.enabled)));
		}
		if (config.retentionDays !== undefined) {
			promises.push(saveSetting('auditRetentionDays', String(config.retentionDays)));
		}
		if (config.categories !== undefined) {
			promises.push(saveSetting('auditCategories', JSON.stringify(config.categories)));
		}

		await Promise.all(promises);

		// Invalidar cache
		this.configCache = null;
	}

	/**
	 * Registra una entrada de auditoria
	 */
	async log(entry: AuditEntry): Promise<void> {
		try {
			const config = await this.getConfig();

			// Verificar si esta habilitado
			if (!config.enabled) {
				return;
			}

			// Verificar categoria habilitada
			const category = this.getCategory(entry.action);
			if (!config.categories[category]) {
				return;
			}

			// Insertar registro
			await db.insert(auditLog).values({
				id: nanoid(),
				timestamp: new Date(),
				action: entry.action,
				userId: entry.userId || null,
				targetType: entry.targetType || null,
				targetId: entry.targetId || null,
				details: entry.details ? JSON.stringify(entry.details) : null,
				ipAddress: entry.ipAddress || null,
				userAgent: entry.userAgent || null,
				severity: entry.severity || 'info'
			});

			// Tambien log a pino si es error/critical
			if (entry.severity === 'error' || entry.severity === 'critical') {
				logger.error({ audit: entry }, `AUDIT: ${entry.action}`);
			}
		} catch (error) {
			// No fallar si el log de auditoria falla, solo loguear
			logger.error({ error, entry }, 'Failed to write audit log');
		}
	}

	/**
	 * Determina la categoria de una accion
	 */
	private getCategory(action: string): keyof AuditConfig['categories'] {
		if (action.startsWith('user_')) return 'user';
		if (action.startsWith('course_')) return 'course';
		if (action.startsWith('activity_')) return 'course';
		if (action.startsWith('settings_')) return 'settings';
		if (action.startsWith('notification_')) return 'notifications';
		return 'errors';
	}

	/**
	 * Consulta logs de auditoria con filtros
	 */
	async query(options: AuditQueryOptions): Promise<{ logs: AuditLogRecord[]; total: number }> {
		const { page = 1, limit = 50, action, userId, severity, startDate, endDate, search } = options;

		const offset = (page - 1) * limit;

		// Construir condiciones
		const conditions: ReturnType<typeof eq>[] = [];

		if (action) {
			conditions.push(eq(auditLog.action, action));
		}
		if (userId) {
			conditions.push(eq(auditLog.userId, userId));
		}
		if (severity) {
			conditions.push(eq(auditLog.severity, severity as typeof auditSeverity.INFO));
		}
		if (startDate) {
			conditions.push(gte(auditLog.timestamp, startDate));
		}
		if (endDate) {
			conditions.push(lte(auditLog.timestamp, endDate));
		}

		// Query principal con join para obtener datos del usuario
		const baseQuery = db
			.select({
				id: auditLog.id,
				timestamp: auditLog.timestamp,
				action: auditLog.action,
				userId: auditLog.userId,
				userEmail: user.email,
				userName: user.username,
				targetType: auditLog.targetType,
				targetId: auditLog.targetId,
				details: auditLog.details,
				ipAddress: auditLog.ipAddress,
				userAgent: auditLog.userAgent,
				severity: auditLog.severity
			})
			.from(auditLog)
			.leftJoin(user, eq(auditLog.userId, user.id));

		// Aplicar condiciones
		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		// Aplicar busqueda si existe
		let finalWhere = whereClause;
		if (search) {
			const searchCondition = or(
				like(auditLog.action, `%${search}%`),
				like(auditLog.details, `%${search}%`),
				like(user.email, `%${search}%`),
				like(user.username, `%${search}%`)
			);
			finalWhere = whereClause ? and(whereClause, searchCondition) : searchCondition;
		}

		const logs = await baseQuery
			.where(finalWhere)
			.orderBy(desc(auditLog.timestamp))
			.limit(limit)
			.offset(offset);

		// Contar total
		const totalResult = await db
			.select({ count: count() })
			.from(auditLog)
			.leftJoin(user, eq(auditLog.userId, user.id))
			.where(finalWhere);

		return {
			logs: logs.map((log) => ({
				...log,
				details: log.details ? JSON.parse(log.details) : null
			})),
			total: totalResult[0]?.count || 0
		};
	}

	/**
	 * Obtiene las acciones disponibles (para filtros)
	 */
	async getAvailableActions(): Promise<string[]> {
		const result = await db
			.selectDistinct({ action: auditLog.action })
			.from(auditLog)
			.orderBy(auditLog.action);

		return result.map((r) => r.action);
	}

	/**
	 * Limpia logs antiguos segun la retencion configurada
	 */
	async cleanup(): Promise<{ deleted: number }> {
		const config = await this.getConfig();
		const cutoffDate = new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000);

		const result = await db.delete(auditLog).where(lte(auditLog.timestamp, cutoffDate));

		logger.info({ deleted: result.changes, cutoffDate }, 'Audit log cleanup completed');

		return { deleted: result.changes };
	}

	/**
	 * Obtiene estadisticas de logs
	 */
	async getStats(): Promise<{
		total: number;
		bySeverity: Record<string, number>;
		byAction: { action: string; count: number }[];
		last24Hours: number;
		last7Days: number;
	}> {
		const now = new Date();
		const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

		const [totalResult, severityResult, actionResult, last24Result, last7Result] =
			await Promise.all([
				db.select({ count: count() }).from(auditLog),

				db
					.select({
						severity: auditLog.severity,
						count: count()
					})
					.from(auditLog)
					.groupBy(auditLog.severity),

				db
					.select({
						action: auditLog.action,
						count: count()
					})
					.from(auditLog)
					.groupBy(auditLog.action)
					.orderBy(desc(count()))
					.limit(10),

				db.select({ count: count() }).from(auditLog).where(gte(auditLog.timestamp, oneDayAgo)),

				db.select({ count: count() }).from(auditLog).where(gte(auditLog.timestamp, sevenDaysAgo))
			]);

		const bySeverity: Record<string, number> = {};
		severityResult.forEach((r) => {
			bySeverity[r.severity || 'info'] = r.count;
		});

		return {
			total: totalResult[0]?.count || 0,
			bySeverity,
			byAction: actionResult.map((r) => ({ action: r.action, count: r.count })),
			last24Hours: last24Result[0]?.count || 0,
			last7Days: last7Result[0]?.count || 0
		};
	}
}

// Exportar instancia singleton
export const auditService = new AuditService();

// Re-exportar constantes utiles
export { auditAction, auditSeverity };
