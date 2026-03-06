import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '..';
import * as schema from '../schema';
import { DBAgentToolUtils } from '../agent';
import type { ToolDefinitionResolved } from '$lib/types/agent';
import { ModelResolver } from '$lib/server/ai/services/ModelResolver';
import type {
	InsightsAgentConfig,
	InsightsAgentRunScope,
	InsightsAgentRunSummary
} from '$lib/types/insightsAgent';

const DEFAULT_TOOL_NAMES = [
	'get_activity_evidence_overview',
	'get_activity_transcripts',
	'get_learning_progress_timeline',
	'get_activity_tool_usage_summary',
	'find_stuck_sessions',
	'analyze_activity_difficulty',
	'summarize_evidence_for_student',
	'draft_teacher_feedback',
	'draft_remediation_plan',
	'recommend_next_activity',
	'forecast_completion_risk',
	'cluster_interaction_patterns',
	'find_inconsistent_grading_cases',
	'rubric_evaluate_response',
	'get_course_student_roster',
	'get_student_progress',
	'search_course_content',
	'compare_student_groups'
];
const ALLOWED_GENERAL_TOOL_NAMES = ['get_student_progress', 'search_course_content', 'calculate_expression'];

const DEFAULT_SCOPE: InsightsAgentRunScope = {
	mode: 'cohort',
	studentIds: [],
	chatIds: [],
	dateFrom: null,
	dateTo: null,
	search: null
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
	if (!value) return fallback;
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

function toIso(value: Date | null | undefined): string | null {
	return value ? value.toISOString() : null;
}

export default class DBInsightsAgentUtils {
	static isToolAllowedForInsightsAgent(tool: {
		name: string;
		usageDomain: string | null;
		category: string;
	}) {
		if (tool.category === 'ui') return false;
		if (tool.usageDomain === 'insights') return true;
		return ALLOWED_GENERAL_TOOL_NAMES.includes(tool.name);
	}

	static defaultScope(): InsightsAgentRunScope {
		return structuredClone(DEFAULT_SCOPE);
	}

	static async getConfig(activityId: string) {
		const [record] = await db
			.select()
			.from(schema.interactiveLearningInsightsAgent)
			.where(eq(schema.interactiveLearningInsightsAgent.id, activityId));

		return record ?? null;
	}

	static async getOrCreateConfig(activityId: string) {
		const existing = await this.getConfig(activityId);
		if (existing) return existing;

		await DBAgentToolUtils.seedBuiltinTools();

		const defaultModel = await ModelResolver.getDefaultModel();
		const now = new Date();
		await db.insert(schema.interactiveLearningInsightsAgent).values({
			id: activityId,
			llmRole: 'Analista de learning analytics',
			llmInstructions:
				'Analiza evidencia educativa con rigor. Usa herramientas cuando necesites datos adicionales y distingue hechos observados de inferencias.',
			llmContext:
				'Trabajas para docentes y equipos académicos. Tu salida debe ser accionable, prudente y basada en evidencia recuperada.',
			systemPrompt: null,
			llmModel: defaultModel,
			temperature: 0.2,
			maxTokens: 2200,
			topP: null,
			maxToolRoundtrips: 8,
			parallelToolCalls: false,
			toolChoice: 'auto',
			metadata: null,
			createdAt: now,
			updatedAt: now
		});

		const activeTools = await DBAgentToolUtils.getActiveToolDefinitions();
		const defaultToolIds = activeTools
			.filter((tool) => DEFAULT_TOOL_NAMES.includes(tool.name))
			.map((tool) => tool.id);

		if (defaultToolIds.length > 0) {
			await db.insert(schema.insightsAgentActivityTool).values(
				defaultToolIds.map((toolId) => ({
					id: nanoid(),
					insightsAgentId: activityId,
					toolDefinitionId: toolId,
					isEnabled: true,
					createdAt: now
				}))
			);
		}

		const created = await this.getConfig(activityId);
		if (!created) {
			throw new Error('No se pudo inicializar la configuracion del agente de insights');
		}

		return created;
	}

	static async updateConfig(
		activityId: string,
		updates: Partial<typeof schema.interactiveLearningInsightsAgent.$inferInsert>
	) {
		await db
			.update(schema.interactiveLearningInsightsAgent)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(schema.interactiveLearningInsightsAgent.id, activityId));
	}

	static async getEnabledToolsForActivity(activityId: string): Promise<ToolDefinitionResolved[]> {
		const rows = await db
			.select({
				tool: schema.agentToolDefinition,
				activityTool: schema.insightsAgentActivityTool
			})
			.from(schema.insightsAgentActivityTool)
			.innerJoin(
				schema.agentToolDefinition,
				eq(schema.insightsAgentActivityTool.toolDefinitionId, schema.agentToolDefinition.id)
			)
			.where(
				and(
					eq(schema.insightsAgentActivityTool.insightsAgentId, activityId),
					eq(schema.insightsAgentActivityTool.isEnabled, true),
					eq(schema.agentToolDefinition.isActive, true)
				)
			)
			.orderBy(asc(schema.agentToolDefinition.category), asc(schema.agentToolDefinition.name));

		return rows
			.filter(({ tool }) => this.isToolAllowedForInsightsAgent(tool))
			.map(({ tool, activityTool }) => ({
			id: tool.id,
			name: tool.name,
			displayName: tool.displayName,
			description: tool.description,
			category: tool.category,
			parametersSchema: parseJson(tool.parametersSchema, {}),
			responseSchema: parseJson<Record<string, unknown> | undefined>(tool.responseSchema, undefined),
			executorType: tool.executorType as 'builtin' | 'http' | 'script',
			executorConfig: parseJson(tool.executorConfig, {}),
			requiresConfirmation: tool.requiresConfirmation,
			riskLevel: tool.riskLevel as 'low' | 'medium' | 'high',
			usageDomain: tool.usageDomain,
			configOverride: parseJson<Record<string, unknown> | undefined>(
				activityTool.configOverride,
				undefined
			)
		}));
	}

	static async setActivityTools(activityId: string, toolIds: string[]) {
		const allowedTools = await DBAgentToolUtils.getActiveToolDefinitions();
		const allowedToolIds = allowedTools
			.filter((tool) => this.isToolAllowedForInsightsAgent(tool))
			.map((tool) => tool.id);
		const normalizedToolIds = toolIds.filter((toolId) => allowedToolIds.includes(toolId));

		await db
			.delete(schema.insightsAgentActivityTool)
			.where(eq(schema.insightsAgentActivityTool.insightsAgentId, activityId));

		if (normalizedToolIds.length === 0) return;

		const now = new Date();
		await db.insert(schema.insightsAgentActivityTool).values(
			normalizedToolIds.map((toolId) => ({
				id: nanoid(),
				insightsAgentId: activityId,
				toolDefinitionId: toolId,
				isEnabled: true,
				createdAt: now
			}))
		);
	}

	static toConfigDTO(
		record: typeof schema.interactiveLearningInsightsAgent.$inferSelect,
		enabledToolIds: string[]
	): InsightsAgentConfig {
		return {
			id: record.id,
			llmRole: record.llmRole,
			llmInstructions: record.llmInstructions,
			llmContext: record.llmContext,
			systemPrompt: record.systemPrompt,
			llmModel: record.llmModel,
			temperature: record.temperature,
			maxTokens: record.maxTokens,
			topP: record.topP,
			maxToolRoundtrips: record.maxToolRoundtrips,
			parallelToolCalls: record.parallelToolCalls,
			toolChoice: record.toolChoice as 'auto' | 'required' | 'none',
			enabledToolIds,
			updatedAt: record.updatedAt.toISOString()
		};
	}

	static async getConfigDTO(activityId: string): Promise<InsightsAgentConfig> {
		await DBAgentToolUtils.seedBuiltinTools();
		const config = await this.getOrCreateConfig(activityId);
		const tools = await this.getEnabledToolsForActivity(activityId);
		return this.toConfigDTO(config, tools.map((tool) => tool.id));
	}

	static normalizeScope(scope: Partial<InsightsAgentRunScope> | null | undefined): InsightsAgentRunScope {
		return {
			mode:
				scope?.mode === 'students' || scope?.mode === 'sessions' || scope?.mode === 'cohort'
					? scope.mode
					: 'cohort',
			studentIds: Array.isArray(scope?.studentIds)
				? scope.studentIds.filter((value): value is string => typeof value === 'string')
				: [],
			chatIds: Array.isArray(scope?.chatIds)
				? scope.chatIds.filter((value): value is string => typeof value === 'string')
				: [],
			dateFrom: typeof scope?.dateFrom === 'string' ? scope.dateFrom : null,
			dateTo: typeof scope?.dateTo === 'string' ? scope.dateTo : null,
			search: typeof scope?.search === 'string' && scope.search.trim().length > 0 ? scope.search : null
		};
	}

	static async createRun(params: {
		interactiveLearningId: string;
		userId: string;
		title?: string | null;
		scope?: Partial<InsightsAgentRunScope> | null;
	}) {
		const runId = nanoid();
		const chatId = nanoid();
		const now = new Date();
		const scope = this.normalizeScope(params.scope);

		await db.insert(schema.chat).values({
			id: chatId,
			userId: params.userId,
			title: params.title?.trim() || 'Nuevo analisis',
			metadata: JSON.stringify({
				kind: 'insights_agent_run',
				interactiveLearningId: params.interactiveLearningId,
				scope
			}),
			createdAt: now,
			updatedAt: now
		});

		await db.insert(schema.insightsAgentRun).values({
			id: runId,
			interactiveLearningId: params.interactiveLearningId,
			chatId,
			createdByUserId: params.userId,
			title: params.title?.trim() || null,
			status: 'draft',
			summary: null,
			scope: JSON.stringify(scope),
			metadata: null,
			lastMessageAt: null,
			createdAt: now,
			updatedAt: now
		});

		const created = await this.getRun(runId);
		if (!created) throw new Error('No se pudo crear el run de insights');
		return created;
	}

	static async getRun(runId: string) {
		const [record] = await db
			.select()
			.from(schema.insightsAgentRun)
			.where(eq(schema.insightsAgentRun.id, runId));
		return record ?? null;
	}

	static async getRunForActivity(runId: string, activityId: string) {
		const [record] = await db
			.select()
			.from(schema.insightsAgentRun)
			.where(
				and(
					eq(schema.insightsAgentRun.id, runId),
					eq(schema.insightsAgentRun.interactiveLearningId, activityId)
				)
			);
		return record ?? null;
	}

	static toRunSummary(record: typeof schema.insightsAgentRun.$inferSelect): InsightsAgentRunSummary {
		return {
			id: record.id,
			interactiveLearningId: record.interactiveLearningId,
			chatId: record.chatId,
			createdByUserId: record.createdByUserId,
			title: record.title,
			status: record.status as InsightsAgentRunSummary['status'],
			summary: record.summary,
			scope: this.normalizeScope(parseJson(record.scope, DEFAULT_SCOPE)),
			lastMessageAt: toIso(record.lastMessageAt),
			createdAt: record.createdAt.toISOString(),
			updatedAt: record.updatedAt.toISOString()
		};
	}

	static async listRunsForActivity(activityId: string) {
		const rows = await db
			.select()
			.from(schema.insightsAgentRun)
			.where(eq(schema.insightsAgentRun.interactiveLearningId, activityId))
			.orderBy(desc(schema.insightsAgentRun.updatedAt), desc(schema.insightsAgentRun.createdAt));

		return rows.map((row) => this.toRunSummary(row));
	}

	static async updateRun(
		runId: string,
		updates: Partial<typeof schema.insightsAgentRun.$inferInsert>
	) {
		await db
			.update(schema.insightsAgentRun)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(schema.insightsAgentRun.id, runId));
	}

	static async touchRun(runId: string, updates?: Partial<typeof schema.insightsAgentRun.$inferInsert>) {
		await this.updateRun(runId, {
			lastMessageAt: new Date(),
			...updates
		});
	}

	static async getRunsByChatIds(chatIds: string[]) {
		if (chatIds.length === 0) return [];
		const rows = await db
			.select()
			.from(schema.insightsAgentRun)
			.where(inArray(schema.insightsAgentRun.chatId, chatIds));
		return rows;
	}
}
