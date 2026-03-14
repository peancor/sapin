import { createHash } from 'node:crypto';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

export type AIRequestCaptureMode = 'focus_only';
export type AIRequestCapturePayloadSource = 'app_exact';
export type AIRequestCapturePayloadLevel = 'full';
export type AIRequestCaptureTargetType = 'activity' | 'session';
export type AIRequestRoundType = 'chat' | 'agent' | 'agent_resume';
export type AIRequestRoundStatus = 'pending' | 'success' | 'error';

export interface AIRequestCaptureConfig {
	enabled: boolean;
	mode: AIRequestCaptureMode;
	payloadSource: AIRequestCapturePayloadSource;
	payloadLevel: AIRequestCapturePayloadLevel;
	retentionDays: number;
}

export interface AIRequestCaptureFocusRecord {
	id: string;
	targetType: AIRequestCaptureTargetType;
	targetId: string;
	enabled: boolean;
	reason: string | null;
	expiresAt: Date | null;
	createdBy: string | null;
	createdAt: Date;
	updatedAt: Date;
	createdByName: string | null;
	createdByEmail: string | null;
}

export interface AIRequestRoundStartInput {
	interactiveLearningId?: string | null;
	chatId?: string | null;
	userId?: string | null;
	courseId?: string | null;
	modelName?: string | null;
	roundType: AIRequestRoundType;
	systemPromptExact?: string | null;
	messagesExact?: unknown;
	toolsExact?: unknown;
	requestOptions?: unknown;
	ragContextExact?: string | null;
	ragSources?: unknown;
	memoryContextExact?: string | null;
	requestPayload?: unknown;
	messageCount?: number;
	toolCount?: number;
	ragEnabled?: boolean;
	ragContextUsed?: boolean;
	memoryContextUsed?: boolean;
	resumed?: boolean;
	startedAt?: Date;
}

export interface AIRequestRoundFinishInput {
	roundId: string;
	status?: Extract<AIRequestRoundStatus, 'success' | 'error'>;
	usageLogId?: string | null;
	responseSummary?: unknown;
	providerUsage?: unknown;
	inputTokens?: number;
	outputTokens?: number;
	cachedInputTokens?: number | null;
	reasoningTokens?: number | null;
	durationMs?: number | null;
	errorMessage?: string | null;
	finishedAt?: Date;
}

const CONFIG_KEY = 'aiRequestCaptureConfig';
const CONFIG_CACHE_TTL_MS = 60_000;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

const DEFAULT_CONFIG: AIRequestCaptureConfig = {
	enabled: false,
	mode: 'focus_only',
	payloadSource: 'app_exact',
	payloadLevel: 'full',
	retentionDays: 30
};

let configCache: AIRequestCaptureConfig | null = null;
let configCacheTime = 0;
let cleanupStartedAt = 0;
let cleanupPromise: Promise<void> | null = null;

function normalizeJsonValue(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map((item) => normalizeJsonValue(item));
	if (!value || typeof value !== 'object') return value;

	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, innerValue]) => [key, normalizeJsonValue(innerValue)])
	);
}

function stableStringify(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	return JSON.stringify(normalizeJsonValue(value));
}

function textHash(value: string | null): string | null {
	if (!value) return null;
	return createHash('sha256').update(value).digest('hex');
}

function toApproxTokens(characters: number | null): number | null {
	if (!characters || characters <= 0) return null;
	return Math.ceil(characters / 4);
}

function countTools(value: unknown): number {
	if (!value) return 0;
	if (Array.isArray(value)) return value.length;
	if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length;
	return 0;
}

function parseConfig(value: string | null | undefined): AIRequestCaptureConfig {
	if (!value) return DEFAULT_CONFIG;

	try {
		const parsed = JSON.parse(value) as Partial<AIRequestCaptureConfig>;
		return {
			enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
			mode: parsed.mode ?? DEFAULT_CONFIG.mode,
			payloadSource: parsed.payloadSource ?? DEFAULT_CONFIG.payloadSource,
			payloadLevel: parsed.payloadLevel ?? DEFAULT_CONFIG.payloadLevel,
			retentionDays: parsed.retentionDays ?? DEFAULT_CONFIG.retentionDays
		};
	} catch {
		return DEFAULT_CONFIG;
	}
}

async function saveSetting(key: string, value: string): Promise<void> {
	const existing = await db.select().from(schema.appSetting).where(eq(schema.appSetting.key, key)).get();

	if (existing) {
		await db.update(schema.appSetting).set({ value }).where(eq(schema.appSetting.key, key));
		return;
	}

	await db.insert(schema.appSetting).values({
		id: nanoid(),
		key,
		value,
		createdAt: new Date()
	});
}

export class AIRequestCaptureService {
	static async getConfig(): Promise<AIRequestCaptureConfig> {
		if (configCache && Date.now() - configCacheTime < CONFIG_CACHE_TTL_MS) {
			return configCache;
		}

		try {
			const setting = await db
				.select()
				.from(schema.appSetting)
				.where(eq(schema.appSetting.key, CONFIG_KEY))
				.get();

			configCache = parseConfig(setting?.value);
			configCacheTime = Date.now();
			return configCache;
		} catch (error) {
			console.error('[AIRequestCaptureService] Failed to load config:', error);
			return DEFAULT_CONFIG;
		}
	}

	static async saveConfig(
		input: Partial<AIRequestCaptureConfig>
	): Promise<AIRequestCaptureConfig> {
		const merged = {
			...(await this.getConfig()),
			...input
		} satisfies AIRequestCaptureConfig;

		await saveSetting(CONFIG_KEY, JSON.stringify(merged));
		configCache = merged;
		configCacheTime = Date.now();
		return merged;
	}

	static async listFocuses(options?: {
		targetType?: AIRequestCaptureTargetType;
		targetId?: string;
		onlyEnabled?: boolean;
		onlyActive?: boolean;
	}): Promise<AIRequestCaptureFocusRecord[]> {
		const now = new Date();
		const conditions = [];

		if (options?.targetType) conditions.push(eq(schema.aiRequestCaptureFocus.targetType, options.targetType));
		if (options?.targetId) conditions.push(eq(schema.aiRequestCaptureFocus.targetId, options.targetId));
		if (options?.onlyEnabled) conditions.push(eq(schema.aiRequestCaptureFocus.enabled, true));
		if (options?.onlyActive) {
			conditions.push(
				or(
					isNull(schema.aiRequestCaptureFocus.expiresAt),
					gte(schema.aiRequestCaptureFocus.expiresAt, now)
				)!
			);
		}

		const rows = await db
			.select({
				id: schema.aiRequestCaptureFocus.id,
				targetType: schema.aiRequestCaptureFocus.targetType,
				targetId: schema.aiRequestCaptureFocus.targetId,
				enabled: schema.aiRequestCaptureFocus.enabled,
				reason: schema.aiRequestCaptureFocus.reason,
				expiresAt: schema.aiRequestCaptureFocus.expiresAt,
				createdBy: schema.aiRequestCaptureFocus.createdBy,
				createdAt: schema.aiRequestCaptureFocus.createdAt,
				updatedAt: schema.aiRequestCaptureFocus.updatedAt,
				createdByName: schema.user.username,
				createdByEmail: schema.user.email
			})
			.from(schema.aiRequestCaptureFocus)
			.leftJoin(schema.user, eq(schema.aiRequestCaptureFocus.createdBy, schema.user.id))
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(desc(schema.aiRequestCaptureFocus.updatedAt));

		return rows;
	}

	static async getFocus(
		targetType: AIRequestCaptureTargetType,
		targetId: string
	): Promise<AIRequestCaptureFocusRecord | null> {
		const rows = await this.listFocuses({ targetType, targetId });
		return rows[0] ?? null;
	}

	static async setFocus(input: {
		targetType: AIRequestCaptureTargetType;
		targetId: string;
		enabled: boolean;
		reason?: string | null;
		expiresAt?: Date | null;
		createdBy?: string | null;
	}): Promise<AIRequestCaptureFocusRecord> {
		const existing = await this.getFocus(input.targetType, input.targetId);
		const now = new Date();

		if (existing) {
			await db
				.update(schema.aiRequestCaptureFocus)
				.set({
					enabled: input.enabled,
					reason: input.reason ?? existing.reason,
					expiresAt: input.expiresAt ?? null,
					createdBy: input.createdBy ?? existing.createdBy,
					updatedAt: now
				})
				.where(eq(schema.aiRequestCaptureFocus.id, existing.id));
		} else {
			await db.insert(schema.aiRequestCaptureFocus).values({
				id: nanoid(),
				targetType: input.targetType,
				targetId: input.targetId,
				enabled: input.enabled,
				reason: input.reason ?? null,
				expiresAt: input.expiresAt ?? null,
				createdBy: input.createdBy ?? null,
				createdAt: now,
				updatedAt: now
			});
		}

		return (await this.getFocus(input.targetType, input.targetId))!;
	}

	static async disableFocus(
		targetType: AIRequestCaptureTargetType,
		targetId: string,
		createdBy?: string | null
	): Promise<AIRequestCaptureFocusRecord | null> {
		const existing = await this.getFocus(targetType, targetId);
		if (!existing) return null;

		await db
			.update(schema.aiRequestCaptureFocus)
			.set({
				enabled: false,
				createdBy: createdBy ?? existing.createdBy,
				updatedAt: new Date()
			})
			.where(eq(schema.aiRequestCaptureFocus.id, existing.id));

		return this.getFocus(targetType, targetId);
	}

	static async shouldCapture(context: {
		interactiveLearningId?: string | null;
		chatId?: string | null;
	}): Promise<boolean> {
		const config = await this.getConfig();
		if (!config.enabled) return false;

		if (config.mode !== 'focus_only') {
			return false;
		}

		const conditions = [];
		const now = new Date();

		if (context.interactiveLearningId) {
			conditions.push(
				and(
					eq(schema.aiRequestCaptureFocus.targetType, 'activity'),
					eq(schema.aiRequestCaptureFocus.targetId, context.interactiveLearningId)
				)
			);
		}

		if (context.chatId) {
			conditions.push(
				and(
					eq(schema.aiRequestCaptureFocus.targetType, 'session'),
					eq(schema.aiRequestCaptureFocus.targetId, context.chatId)
				)
			);
		}

		if (conditions.length === 0) return false;

		const focus = await db
			.select({ id: schema.aiRequestCaptureFocus.id })
			.from(schema.aiRequestCaptureFocus)
			.where(
				and(
					eq(schema.aiRequestCaptureFocus.enabled, true),
					or(...conditions)!,
					or(
						isNull(schema.aiRequestCaptureFocus.expiresAt),
						gte(schema.aiRequestCaptureFocus.expiresAt, now)
					)!
				)
			)
			.get();

		return !!focus;
	}

	static async startRound(input: AIRequestRoundStartInput): Promise<string | null> {
		const shouldCapture = await this.shouldCapture({
			interactiveLearningId: input.interactiveLearningId,
			chatId: input.chatId
		});
		if (!shouldCapture) return null;

		const config = await this.getConfig();
		this.scheduleCleanup(config.retentionDays);

		const startedAt = input.startedAt ?? new Date();
		const messagesExactJson = stableStringify(input.messagesExact);
		const toolsExactJson = stableStringify(input.toolsExact);
		const requestOptionsJson = stableStringify(input.requestOptions);
		const ragSourcesJson = stableStringify(input.ragSources);
		const requestPayloadJson = stableStringify(input.requestPayload);
		const systemPromptExact = input.systemPromptExact ?? null;
		const ragContextExact = input.ragContextExact ?? null;
		const memoryContextExact = input.memoryContextExact ?? null;
		const requestChars = requestPayloadJson?.length ?? null;
		const systemPromptChars = systemPromptExact?.length ?? null;
		const messagesChars = messagesExactJson?.length ?? null;
		const ragContextChars = ragContextExact?.length ?? null;
		const memoryContextChars = memoryContextExact?.length ?? null;
		const toolsChars = toolsExactJson?.length ?? null;

		const id = nanoid();

		await db.insert(schema.aiRequestRound).values({
			id,
			interactiveLearningId: input.interactiveLearningId ?? null,
			chatId: input.chatId ?? null,
			userId: input.userId ?? null,
			courseId: input.courseId ?? null,
			modelName: input.modelName ?? null,
			roundType: input.roundType,
			status: 'pending',
			systemPromptExact,
			messagesExactJson,
			toolsExactJson,
			requestOptionsJson,
			ragContextExact,
			ragSourcesJson,
			memoryContextExact,
			requestPayloadJson,
			requestHash: textHash(requestPayloadJson),
			systemPromptHash: textHash(systemPromptExact),
			messagesHash: textHash(messagesExactJson),
			ragContextHash: textHash(ragContextExact),
			memoryContextHash: textHash(memoryContextExact),
			toolsHash: textHash(toolsExactJson),
			requestChars,
			systemPromptChars,
			messagesChars,
			ragContextChars,
			memoryContextChars,
			toolsChars,
			requestApproxTokens: toApproxTokens(requestChars),
			systemPromptApproxTokens: toApproxTokens(systemPromptChars),
			messagesApproxTokens: toApproxTokens(messagesChars),
			ragContextApproxTokens: toApproxTokens(ragContextChars),
			memoryContextApproxTokens: toApproxTokens(memoryContextChars),
			toolsApproxTokens: toApproxTokens(toolsChars),
			messageCount: input.messageCount ?? 0,
			toolCount: input.toolCount ?? countTools(input.toolsExact),
			ragEnabled: input.ragEnabled ?? false,
			ragContextUsed: input.ragContextUsed ?? false,
			memoryContextUsed: input.memoryContextUsed ?? false,
			resumed: input.resumed ?? false,
			startedAt
		});

		return id;
	}

	static async finishRound(input: AIRequestRoundFinishInput): Promise<void> {
		await db
			.update(schema.aiRequestRound)
			.set({
				status: input.status ?? 'success',
				usageLogId: input.usageLogId ?? null,
				responseSummaryJson: stableStringify(input.responseSummary),
				providerUsageJson: stableStringify(input.providerUsage),
				inputTokens: input.inputTokens ?? 0,
				outputTokens: input.outputTokens ?? 0,
				cachedInputTokens: input.cachedInputTokens ?? null,
				reasoningTokens: input.reasoningTokens ?? null,
				durationMs: input.durationMs ?? null,
				errorMessage: input.errorMessage ?? null,
				finishedAt: input.finishedAt ?? new Date()
			})
			.where(eq(schema.aiRequestRound.id, input.roundId));
	}

	static async failRound(
		roundId: string,
		errorMessage: string,
		overrides: Omit<AIRequestRoundFinishInput, 'roundId' | 'status' | 'errorMessage'> = {}
	): Promise<void> {
		await this.finishRound({
			roundId,
			status: 'error',
			errorMessage,
			...overrides
		});
	}

	static async listRounds(options?: {
		interactiveLearningId?: string;
		chatId?: string;
		limit?: number;
	}): Promise<(typeof schema.aiRequestRound.$inferSelect)[]> {
		const conditions = [];
		if (options?.interactiveLearningId) {
			conditions.push(eq(schema.aiRequestRound.interactiveLearningId, options.interactiveLearningId));
		}
		if (options?.chatId) {
			conditions.push(eq(schema.aiRequestRound.chatId, options.chatId));
		}

		return db
			.select()
			.from(schema.aiRequestRound)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(desc(schema.aiRequestRound.startedAt))
			.limit(options?.limit ?? 100);
	}

	static async cleanupExpiredRounds(retentionDays?: number): Promise<void> {
		const config = await this.getConfig();
		const days = retentionDays ?? config.retentionDays;
		const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

		await db
			.delete(schema.aiRequestRound)
			.where(
				or(
					lte(schema.aiRequestRound.finishedAt, cutoff),
					and(isNull(schema.aiRequestRound.finishedAt), lte(schema.aiRequestRound.startedAt, cutoff))
				)!
			);
	}

	private static scheduleCleanup(retentionDays: number): void {
		if (cleanupPromise || Date.now() - cleanupStartedAt < CLEANUP_INTERVAL_MS) {
			return;
		}

		cleanupStartedAt = Date.now();
		cleanupPromise = this.cleanupExpiredRounds(retentionDays)
			.catch((error) => {
				console.error('[AIRequestCaptureService] Cleanup failed:', error);
			})
			.finally(() => {
				cleanupPromise = null;
			});
	}
}
