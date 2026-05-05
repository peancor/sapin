import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface CreateProviderInput {
	name: string;
	displayName: string;
	type: keyof typeof table.aiProviderType;
	baseUrl?: string;
	apiKey?: string;
	isActive?: boolean;
}

export interface CreateModelInput {
	providerId: string;
	name: string;
	displayName: string;
	description?: string;
	capabilities?: string[];
	contextWindow?: number;
	maxOutputTokens?: number;
	inputPricePerMillion?: number;
	outputPricePerMillion?: number;
	isDefault?: boolean;
	isActive?: boolean;
	sortOrder?: number;
}

export interface LogUsageInput {
	modelId: string;
	userId?: string;
	courseId?: string;
	interactiveLearningId?: string;
	chatId?: string;
	requestRoundId?: string;
	operation: 'chat' | 'completion' | 'image' | 'embedding';
	inputTokens: number;
	outputTokens: number;
	durationMs?: number;
	success?: boolean;
	errorMessage?: string;
	metadata?: Record<string, unknown>;
}

export interface CreateQuotaInput {
	type: keyof typeof table.aiQuotaType;
	targetId?: string;
	modelId?: string;
	period?: keyof typeof table.aiQuotaPeriod;
	maxTokens?: number;
	maxRequests?: number;
	maxCost?: number;
}

export interface QuotaCheckResult {
	allowed: boolean;
	reason?: string;
	quotaId?: string;
	remaining?: {
		tokens?: number;
		requests?: number;
		cost?: number;
	};
}

export interface UsageStats {
	totalRequests: number;
	successfulRequests: number;
	failedRequests: number;
	totalTokens: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCost: number;
	avgDurationMs: number;
}

export class AIModelService {
	// ==================== PROVIDERS ====================

	static async getAllProviders() {
		return await db.select().from(table.aiProvider).orderBy(table.aiProvider.displayName);
	}

	static async getActiveProviders() {
		return await db
			.select()
			.from(table.aiProvider)
			.where(eq(table.aiProvider.isActive, true))
			.orderBy(table.aiProvider.displayName);
	}

	static async getProviderById(id: string) {
		const [provider] = await db
			.select()
			.from(table.aiProvider)
			.where(eq(table.aiProvider.id, id));
		return provider;
	}

	static async createProvider(input: CreateProviderInput) {
		const id = nanoid();
		const now = new Date();

		await db.insert(table.aiProvider).values({
			id,
			name: input.name,
			displayName: input.displayName,
			type: table.aiProviderType[input.type],
			baseUrl: input.baseUrl,
			apiKey: input.apiKey,
			isActive: input.isActive ?? true,
			createdAt: now,
			updatedAt: now
		});

		return this.getProviderById(id);
	}

	static async updateProvider(id: string, input: Partial<CreateProviderInput>) {
		await db
			.update(table.aiProvider)
			.set({
				...(input.name && { name: input.name }),
				...(input.displayName && { displayName: input.displayName }),
				...(input.type && { type: table.aiProviderType[input.type] }),
				...(input.baseUrl !== undefined && { baseUrl: input.baseUrl }),
				...(input.apiKey !== undefined && { apiKey: input.apiKey }),
				...(input.isActive !== undefined && { isActive: input.isActive }),
				updatedAt: new Date()
			})
			.where(eq(table.aiProvider.id, id));

		return this.getProviderById(id);
	}

	static async deleteProvider(id: string) {
		await db.delete(table.aiProvider).where(eq(table.aiProvider.id, id));
	}

	// ==================== MODELS ====================

	static async getAllModels() {
		return await db
			.select({
				model: table.aiModel,
				provider: table.aiProvider
			})
			.from(table.aiModel)
			.leftJoin(table.aiProvider, eq(table.aiModel.providerId, table.aiProvider.id))
			.orderBy(table.aiModel.sortOrder, table.aiModel.displayName);
	}

	static async getActiveModels() {
		return await db
			.select({
				model: table.aiModel,
				provider: table.aiProvider
			})
			.from(table.aiModel)
			.leftJoin(table.aiProvider, eq(table.aiModel.providerId, table.aiProvider.id))
			.where(
				and(eq(table.aiModel.isActive, true), eq(table.aiProvider.isActive, true))
			)
			.orderBy(table.aiModel.sortOrder, table.aiModel.displayName);
	}

	static async getModelById(id: string) {
		const [result] = await db
			.select({
				model: table.aiModel,
				provider: table.aiProvider
			})
			.from(table.aiModel)
			.leftJoin(table.aiProvider, eq(table.aiModel.providerId, table.aiProvider.id))
			.where(eq(table.aiModel.id, id));
		return result;
	}

	static async getModelByName(name: string) {
		const [result] = await db
			.select({
				model: table.aiModel,
				provider: table.aiProvider
			})
			.from(table.aiModel)
			.leftJoin(table.aiProvider, eq(table.aiModel.providerId, table.aiProvider.id))
			.where(eq(table.aiModel.name, name));
		return result;
	}

	static async getDefaultModel() {
		const [result] = await db
			.select({
				model: table.aiModel,
				provider: table.aiProvider
			})
			.from(table.aiModel)
			.leftJoin(table.aiProvider, eq(table.aiModel.providerId, table.aiProvider.id))
			.where(
				and(
					eq(table.aiModel.isDefault, true),
					eq(table.aiModel.isActive, true)
				)
			);
		return result;
	}

	static async createModel(input: CreateModelInput) {
		const id = nanoid();
		const now = new Date();

		// Si es default, quitar default de otros modelos
		if (input.isDefault) {
			await db.update(table.aiModel).set({ isDefault: false });
		}

		await db.insert(table.aiModel).values({
			id,
			providerId: input.providerId,
			name: input.name,
			displayName: input.displayName,
			description: input.description,
			capabilities: input.capabilities ? JSON.stringify(input.capabilities) : null,
			contextWindow: input.contextWindow,
			maxOutputTokens: input.maxOutputTokens,
			inputPricePerMillion: input.inputPricePerMillion,
			outputPricePerMillion: input.outputPricePerMillion,
			isDefault: input.isDefault ?? false,
			isActive: input.isActive ?? true,
			sortOrder: input.sortOrder ?? 0,
			createdAt: now,
			updatedAt: now
		});

		return this.getModelById(id);
	}

	static async updateModel(id: string, input: Partial<CreateModelInput>) {
		// Si se establece como default, quitar default de otros
		if (input.isDefault) {
			await db.update(table.aiModel).set({ isDefault: false });
		}

		await db
			.update(table.aiModel)
			.set({
				...(input.providerId && { providerId: input.providerId }),
				...(input.name && { name: input.name }),
				...(input.displayName && { displayName: input.displayName }),
				...(input.description !== undefined && { description: input.description }),
				...(input.capabilities !== undefined && {
					capabilities: input.capabilities ? JSON.stringify(input.capabilities) : null
				}),
				...(input.contextWindow !== undefined && { contextWindow: input.contextWindow }),
				...(input.maxOutputTokens !== undefined && { maxOutputTokens: input.maxOutputTokens }),
				...(input.inputPricePerMillion !== undefined && {
					inputPricePerMillion: input.inputPricePerMillion
				}),
				...(input.outputPricePerMillion !== undefined && {
					outputPricePerMillion: input.outputPricePerMillion
				}),
				...(input.isDefault !== undefined && { isDefault: input.isDefault }),
				...(input.isActive !== undefined && { isActive: input.isActive }),
				...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
				updatedAt: new Date()
			})
			.where(eq(table.aiModel.id, id));

		return this.getModelById(id);
	}

	static async deleteModel(id: string) {
		await db.delete(table.aiModel).where(eq(table.aiModel.id, id));
	}

	// ==================== USAGE LOGGING ====================

	static async logUsage(input: LogUsageInput) {
		const id = nanoid();
		const totalTokens = input.inputTokens + input.outputTokens;

		// Obtener el modelo para calcular el costo
		const modelResult = await this.getModelById(input.modelId);
		let estimatedCost = 0;

		if (modelResult?.model) {
			const inputCost =
				(input.inputTokens / 1_000_000) * (modelResult.model.inputPricePerMillion ?? 0);
			const outputCost =
				(input.outputTokens / 1_000_000) * (modelResult.model.outputPricePerMillion ?? 0);
			estimatedCost = inputCost + outputCost;
		}

		await db.insert(table.aiUsageLog).values({
			id,
			modelId: input.modelId,
			userId: input.userId,
			courseId: input.courseId,
			interactiveLearningId: input.interactiveLearningId,
			chatId: input.chatId,
			requestRoundId: input.requestRoundId,
			operation: input.operation,
			inputTokens: input.inputTokens,
			outputTokens: input.outputTokens,
			totalTokens,
			estimatedCost,
			durationMs: input.durationMs,
			success: input.success ?? true,
			errorMessage: input.errorMessage,
			metadata: input.metadata ? JSON.stringify(input.metadata) : null,
			createdAt: new Date()
		});

		// Actualizar cuotas relevantes
		await this.updateQuotaUsage(input, totalTokens, estimatedCost);

		// Actualizar estadísticas diarias
		await this.updateDailyStats(input.modelId, input, totalTokens, estimatedCost);

		return { id, estimatedCost, totalTokens };
	}

	private static async updateQuotaUsage(
		input: LogUsageInput,
		totalTokens: number,
		estimatedCost: number
	) {
		// Buscar cuotas aplicables (global, usuario, curso, actividad)
		const quotaTypes: { type: keyof typeof table.aiQuotaType; targetId?: string }[] = [
			{ type: 'GLOBAL' },
			...(input.userId ? [{ type: 'USER' as const, targetId: input.userId }] : []),
			...(input.courseId ? [{ type: 'COURSE' as const, targetId: input.courseId }] : []),
			...(input.interactiveLearningId
				? [{ type: 'ACTIVITY' as const, targetId: input.interactiveLearningId }]
				: [])
		];

		for (const { type, targetId } of quotaTypes) {
			const quotas = await db
				.select()
				.from(table.aiQuota)
				.where(
					and(
						eq(table.aiQuota.type, table.aiQuotaType[type]),
						targetId ? eq(table.aiQuota.targetId, targetId) : sql`${table.aiQuota.targetId} IS NULL`,
						eq(table.aiQuota.isActive, true)
					)
				);

			for (const quota of quotas) {
				// Verificar si el modelo aplica a esta cuota
				if (quota.modelId && quota.modelId !== input.modelId) continue;

				await db
					.update(table.aiQuota)
					.set({
						currentTokens: quota.currentTokens + totalTokens,
						currentRequests: quota.currentRequests + 1,
						currentCost: quota.currentCost + estimatedCost,
						updatedAt: new Date()
					})
					.where(eq(table.aiQuota.id, quota.id));
			}
		}
	}

	private static async updateDailyStats(
		modelId: string,
		input: LogUsageInput,
		totalTokens: number,
		estimatedCost: number
	) {
		const today = new Date().toISOString().split('T')[0];

		const [existing] = await db
			.select()
			.from(table.aiUsageDailyStats)
			.where(
				and(
					eq(table.aiUsageDailyStats.date, today),
					eq(table.aiUsageDailyStats.modelId, modelId)
				)
			);

		if (existing) {
			const newTotalRequests = existing.totalRequests + 1;
			const newAvgDuration = Math.round(
				(existing.avgDurationMs * existing.totalRequests + (input.durationMs ?? 0)) /
				newTotalRequests
			);

			await db
				.update(table.aiUsageDailyStats)
				.set({
					totalRequests: newTotalRequests,
					successfulRequests: existing.successfulRequests + (input.success !== false ? 1 : 0),
					failedRequests: existing.failedRequests + (input.success === false ? 1 : 0),
					totalInputTokens: existing.totalInputTokens + input.inputTokens,
					totalOutputTokens: existing.totalOutputTokens + input.outputTokens,
					totalTokens: existing.totalTokens + totalTokens,
					totalCost: existing.totalCost + estimatedCost,
					avgDurationMs: newAvgDuration,
					updatedAt: new Date()
				})
				.where(eq(table.aiUsageDailyStats.id, existing.id));
		} else {
			await db.insert(table.aiUsageDailyStats).values({
				id: nanoid(),
				date: today,
				modelId,
				totalRequests: 1,
				successfulRequests: input.success !== false ? 1 : 0,
				failedRequests: input.success === false ? 1 : 0,
				totalInputTokens: input.inputTokens,
				totalOutputTokens: input.outputTokens,
				totalTokens,
				totalCost: estimatedCost,
				avgDurationMs: input.durationMs ?? 0,
				uniqueUsers: input.userId ? 1 : 0,
				createdAt: new Date(),
				updatedAt: new Date()
			});
		}
	}

	// ==================== QUOTAS ====================

	static async getAllQuotas() {
		return await db.select().from(table.aiQuota).orderBy(table.aiQuota.type);
	}

	static async getQuotaById(id: string) {
		const [quota] = await db.select().from(table.aiQuota).where(eq(table.aiQuota.id, id));
		return quota;
	}

	static async getQuotasForTarget(type: keyof typeof table.aiQuotaType, targetId?: string) {
		return await db
			.select()
			.from(table.aiQuota)
			.where(
				and(
					eq(table.aiQuota.type, table.aiQuotaType[type]),
					targetId
						? eq(table.aiQuota.targetId, targetId)
						: sql`${table.aiQuota.targetId} IS NULL`
				)
			);
	}

	static async createQuota(input: CreateQuotaInput) {
		const id = nanoid();
		const now = new Date();

		await db.insert(table.aiQuota).values({
			id,
			type: table.aiQuotaType[input.type],
			targetId: input.targetId,
			modelId: input.modelId,
			period: input.period ? table.aiQuotaPeriod[input.period] : 'monthly',
			maxTokens: input.maxTokens,
			maxRequests: input.maxRequests,
			maxCost: input.maxCost,
			currentTokens: 0,
			currentRequests: 0,
			currentCost: 0,
			periodStartedAt: now,
			isActive: true,
			createdAt: now,
			updatedAt: now
		});

		return this.getQuotaById(id);
	}

	static async updateQuota(id: string, input: Partial<CreateQuotaInput>) {
		await db
			.update(table.aiQuota)
			.set({
				...(input.type && { type: table.aiQuotaType[input.type] }),
				...(input.targetId !== undefined && { targetId: input.targetId }),
				...(input.modelId !== undefined && { modelId: input.modelId }),
				...(input.period && { period: table.aiQuotaPeriod[input.period] }),
				...(input.maxTokens !== undefined && { maxTokens: input.maxTokens }),
				...(input.maxRequests !== undefined && { maxRequests: input.maxRequests }),
				...(input.maxCost !== undefined && { maxCost: input.maxCost }),
				updatedAt: new Date()
			})
			.where(eq(table.aiQuota.id, id));

		return this.getQuotaById(id);
	}

	static async deleteQuota(id: string) {
		await db.delete(table.aiQuota).where(eq(table.aiQuota.id, id));
	}

	static async resetQuota(id: string) {
		await db
			.update(table.aiQuota)
			.set({
				currentTokens: 0,
				currentRequests: 0,
				currentCost: 0,
				periodStartedAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(table.aiQuota.id, id));

		return this.getQuotaById(id);
	}

	static async checkQuota(
		modelId: string,
		userId?: string,
		courseId?: string,
		interactiveLearningId?: string
	): Promise<QuotaCheckResult> {
		// Verificar todas las cuotas aplicables
		const quotaChecks: { type: keyof typeof table.aiQuotaType; targetId?: string }[] = [
			{ type: 'GLOBAL' },
			...(userId ? [{ type: 'USER' as const, targetId: userId }] : []),
			...(courseId ? [{ type: 'COURSE' as const, targetId: courseId }] : []),
			...(interactiveLearningId
				? [{ type: 'ACTIVITY' as const, targetId: interactiveLearningId }]
				: [])
		];

		for (const { type, targetId } of quotaChecks) {
			const quotas = await this.getQuotasForTarget(type, targetId);

			for (const quota of quotas) {
				if (!quota.isActive) continue;
				if (quota.modelId && quota.modelId !== modelId) continue;

				// Verificar si el período ha expirado
				if (quota.period !== 'unlimited') {
					const periodExpired = this.isPeriodExpired(quota.periodStartedAt, quota.period);
					if (periodExpired) {
						// Resetear cuota automáticamente
						await this.resetQuota(quota.id);
						continue;
					}
				}

				// Verificar límites
				if (quota.maxTokens && quota.currentTokens >= quota.maxTokens) {
					return {
						allowed: false,
						reason: `Cuota de tokens excedida (${type})`,
						quotaId: quota.id,
						remaining: { tokens: 0 }
					};
				}

				if (quota.maxRequests && quota.currentRequests >= quota.maxRequests) {
					return {
						allowed: false,
						reason: `Cuota de peticiones excedida (${type})`,
						quotaId: quota.id,
						remaining: { requests: 0 }
					};
				}

				if (quota.maxCost && quota.currentCost >= quota.maxCost) {
					return {
						allowed: false,
						reason: `Cuota de costo excedida (${type})`,
						quotaId: quota.id,
						remaining: { cost: 0 }
					};
				}
			}
		}

		return { allowed: true };
	}

	private static isPeriodExpired(
		periodStart: Date,
		period: string
	): boolean {
		const now = new Date();
		const start = new Date(periodStart);

		switch (period) {
			case 'daily':
				return now.getTime() - start.getTime() > 24 * 60 * 60 * 1000;
			case 'weekly':
				return now.getTime() - start.getTime() > 7 * 24 * 60 * 60 * 1000;
			case 'monthly':
				return (
					now.getMonth() !== start.getMonth() || now.getFullYear() !== start.getFullYear()
				);
			default:
				return false;
		}
	}

	// ==================== STATISTICS ====================

	static async getUsageStats(
		startDate?: Date,
		endDate?: Date,
		modelId?: string,
		userId?: string,
		courseId?: string
	): Promise<UsageStats> {
		const conditions = [];

		if (startDate) {
			conditions.push(gte(table.aiUsageLog.createdAt, startDate));
		}
		if (endDate) {
			conditions.push(lte(table.aiUsageLog.createdAt, endDate));
		}
		if (modelId) {
			conditions.push(eq(table.aiUsageLog.modelId, modelId));
		}
		if (userId) {
			conditions.push(eq(table.aiUsageLog.userId, userId));
		}
		if (courseId) {
			conditions.push(eq(table.aiUsageLog.courseId, courseId));
		}

		const [result] = await db
			.select({
				totalRequests: sql<number>`COUNT(*)`,
				successfulRequests: sql<number>`SUM(CASE WHEN ${table.aiUsageLog.success} = 1 THEN 1 ELSE 0 END)`,
				failedRequests: sql<number>`SUM(CASE WHEN ${table.aiUsageLog.success} = 0 THEN 1 ELSE 0 END)`,
				totalTokens: sql<number>`COALESCE(SUM(${table.aiUsageLog.totalTokens}), 0)`,
				totalInputTokens: sql<number>`COALESCE(SUM(${table.aiUsageLog.inputTokens}), 0)`,
				totalOutputTokens: sql<number>`COALESCE(SUM(${table.aiUsageLog.outputTokens}), 0)`,
				totalCost: sql<number>`COALESCE(SUM(${table.aiUsageLog.estimatedCost}), 0)`,
				avgDurationMs: sql<number>`COALESCE(AVG(${table.aiUsageLog.durationMs}), 0)`
			})
			.from(table.aiUsageLog)
			.where(conditions.length > 0 ? and(...conditions) : undefined);

		return {
			totalRequests: result?.totalRequests ?? 0,
			successfulRequests: result?.successfulRequests ?? 0,
			failedRequests: result?.failedRequests ?? 0,
			totalTokens: result?.totalTokens ?? 0,
			totalInputTokens: result?.totalInputTokens ?? 0,
			totalOutputTokens: result?.totalOutputTokens ?? 0,
			totalCost: result?.totalCost ?? 0,
			avgDurationMs: Math.round(result?.avgDurationMs ?? 0)
		};
	}

	static async getDailyStats(startDate: string, endDate: string, modelId?: string) {
		const conditions = [
			gte(table.aiUsageDailyStats.date, startDate),
			lte(table.aiUsageDailyStats.date, endDate)
		];

		if (modelId) {
			conditions.push(eq(table.aiUsageDailyStats.modelId, modelId));
		}

		return await db
			.select()
			.from(table.aiUsageDailyStats)
			.where(and(...conditions))
			.orderBy(table.aiUsageDailyStats.date);
	}

	static async getRecentUsageLogs(limit: number = 50, modelId?: string, userId?: string) {
		const conditions = [];

		if (modelId) {
			conditions.push(eq(table.aiUsageLog.modelId, modelId));
		}
		if (userId) {
			conditions.push(eq(table.aiUsageLog.userId, userId));
		}

		return await db
			.select({
				log: table.aiUsageLog,
				model: table.aiModel,
				user: table.user
			})
			.from(table.aiUsageLog)
			.leftJoin(table.aiModel, eq(table.aiUsageLog.modelId, table.aiModel.id))
			.leftJoin(table.user, eq(table.aiUsageLog.userId, table.user.id))
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(desc(table.aiUsageLog.createdAt))
			.limit(limit);
	}

	static async getTopUsersByUsage(startDate?: Date, endDate?: Date, limit: number = 10) {
		const conditions = [];

		if (startDate) {
			conditions.push(gte(table.aiUsageLog.createdAt, startDate));
		}
		if (endDate) {
			conditions.push(lte(table.aiUsageLog.createdAt, endDate));
		}

		return await db
			.select({
				userId: table.aiUsageLog.userId,
				user: table.user,
				totalTokens: sql<number>`SUM(${table.aiUsageLog.totalTokens})`,
				totalRequests: sql<number>`COUNT(*)`,
				totalCost: sql<number>`SUM(${table.aiUsageLog.estimatedCost})`
			})
			.from(table.aiUsageLog)
			.leftJoin(table.user, eq(table.aiUsageLog.userId, table.user.id))
			.where(
				and(
					sql`${table.aiUsageLog.userId} IS NOT NULL`,
					...(conditions.length > 0 ? conditions : [])
				)
			)
			.groupBy(table.aiUsageLog.userId)
			.orderBy(desc(sql`SUM(${table.aiUsageLog.totalTokens})`))
			.limit(limit);
	}

	// ==================== SEED DEFAULT DATA ====================

	static async seedDefaultProviders() {
		const existingProviders = await this.getAllProviders();
		if (existingProviders.length > 0) return;

		const defaultProviders: CreateProviderInput[] = [
			{
				name: 'openai',
				displayName: 'OpenAI',
				type: 'OPENAI'
			},
			{
				name: 'openrouter',
				displayName: 'OpenRouter',
				type: 'OPENROUTER'
			},
			{
				name: 'anthropic',
				displayName: 'Anthropic',
				type: 'ANTHROPIC'
			},
			{
				name: 'google',
				displayName: 'Google AI',
				type: 'GOOGLE'
			},
			{
				name: 'lmstudio',
				displayName: 'LM Studio (Local)',
				type: 'LMSTUDIO',
				baseUrl: 'http://localhost:1234/v1'
			}
		];

		for (const provider of defaultProviders) {
			await this.createProvider(provider);
		}
	}

	/**
	 * Obtiene la API key de un proveedor por su tipo
	 */
	static async getApiKeyByProviderType(providerType: (typeof table.aiProviderType)[keyof typeof table.aiProviderType]): Promise<string | null> {
		const [provider] = await db
			.select()
			.from(table.aiProvider)
			.where(
				and(
					eq(table.aiProvider.type, providerType),
					eq(table.aiProvider.isActive, true)
				)
			);
		return provider?.apiKey || null;
	}

	/**
	 * Obtiene la API key de un proveedor por su ID
	 */
	static async getApiKeyByProviderId(providerId: string): Promise<string | null> {
		const provider = await this.getProviderById(providerId);
		return provider?.apiKey || null;
	}

	static async seedDefaultModels() {
		const existingModels = await this.getAllModels();
		if (existingModels.length > 0) return;

		// Asegurar que existen los proveedores
		await this.seedDefaultProviders();

		const providers = await this.getAllProviders();
		const providerMap = new Map(providers.map((p) => [p.name, p.id]));

		const defaultModels: (CreateModelInput & { providerName: string })[] = [
			// OpenAI
			{
				providerName: 'openai',
				providerId: '',
				name: 'gpt-5-2025-08-07',
				displayName: 'GPT-5',
				capabilities: ['text', 'vision'],
				contextWindow: 128000,
				inputPricePerMillion: 5,
				outputPricePerMillion: 15
			},
			{
				providerName: 'openai',
				providerId: '',
				name: 'gpt-5-mini-2025-08-07',
				displayName: 'GPT-5 Mini',
				capabilities: ['text', 'vision'],
				contextWindow: 128000,
				inputPricePerMillion: 0.15,
				outputPricePerMillion: 0.6
			},
			// OpenRouter
			{
				providerName: 'openrouter',
				providerId: '',
				name: 'google/gemini-3-pro-preview',
				displayName: 'Gemini 3 Pro',
				capabilities: ['text', 'vision'],
				contextWindow: 1000000,
				inputPricePerMillion: 4,
				outputPricePerMillion: 18,
				isDefault: true
			},
			{
				providerName: 'openrouter',
				providerId: '',
				name: 'google/gemini-3-flash-preview',
				displayName: 'Gemini 3 Flash',
				capabilities: ['text', 'vision'],
				contextWindow: 1000000,
				inputPricePerMillion: 0.5,
				outputPricePerMillion: 3
			},
			{
				providerName: 'openrouter',
				providerId: '',
				name: 'anthropic/claude-sonnet-4',
				displayName: 'Claude Sonnet 4',
				capabilities: ['text', 'vision'],
				contextWindow: 200000,
				inputPricePerMillion: 3,
				outputPricePerMillion: 15
			},
			{
				providerName: 'openrouter',
				providerId: '',
				name: 'anthropic/claude-sonnet-4.5',
				displayName: 'Claude Sonnet 4.5',
				capabilities: ['text', 'vision'],
				contextWindow: 200000,
				inputPricePerMillion: 3,
				outputPricePerMillion: 15
			},
			{
				providerName: 'openrouter',
				providerId: '',
				name: 'anthropic/claude-haiku-4.5',
				displayName: 'Claude Haiku 4.5',
				capabilities: ['text', 'vision'],
				contextWindow: 200000,
				inputPricePerMillion: 1,
				outputPricePerMillion: 5
			},
			{
				providerName: 'openrouter',
				providerId: '',
				name: 'anthropic/claude-opus-4.5',
				displayName: 'Claude Opus 4.5',
				capabilities: ['text', 'vision'],
				contextWindow: 200000,
				inputPricePerMillion: 5,
				outputPricePerMillion: 25
			},
			{
				providerName: 'openrouter',
				providerId: '',
				name: 'x-ai/grok-4',
				displayName: 'Grok 4',
				capabilities: ['text'],
				contextWindow: 128000,
				inputPricePerMillion: 3,
				outputPricePerMillion: 15
			},
			// LM Studio
			{
				providerName: 'lmstudio',
				providerId: '',
				name: 'gemma-3-27b-it',
				displayName: 'Gemma 3 27B (Local)',
				capabilities: ['text'],
				contextWindow: 8192,
				inputPricePerMillion: 0,
				outputPricePerMillion: 0
			}
		];

		for (const model of defaultModels) {
			const providerId = providerMap.get(model.providerName);
			if (providerId) {
				await this.createModel({
					...model,
					providerId
				});
			}
		}
	}
}
