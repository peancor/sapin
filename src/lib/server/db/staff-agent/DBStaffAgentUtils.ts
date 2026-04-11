import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ModelResolver } from '$lib/server/ai/services/ModelResolver';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { DBAgentToolUtils } from '$lib/server/db/agent';
import type { ToolDefinitionResolved } from '$lib/types/agent';
import type {
	StaffAgentThreadSummary,
	StaffAgentWorkspaceConfig,
	StaffAgentWorkspaceKind
} from '$lib/types/staffAgent';

export const STAFF_AGENT_FEATURE_KEY = 'staff_agent' as const;
export const STAFF_AGENT_SCOPE_TYPE = {
	COURSE: 'course',
	ACTIVITY: 'interactive_learning'
} as const;
export const STAFF_AGENT_VISIBILITY = {
	SHARED: 'shared',
	PRIVATE: 'private'
} as const;

const ALLOWED_TOOL_NAMES_BY_KIND: Record<StaffAgentWorkspaceKind, string[]> = {
	course_staff: [
		'get_course_student_roster',
		'get_student_progress',
		'search_course_content',
		'get_course_student_signals',
		'get_course_activity_overview'
	],
	activity_staff: [
		'get_course_student_roster',
		'get_student_progress',
		'search_course_content',
		'get_activity_evidence_overview',
		'get_activity_transcripts',
		'get_activity_tool_usage_summary',
		'get_learning_progress_timeline',
		'compare_student_groups',
		'forecast_completion_risk',
		'find_stuck_sessions',
		'get_activity_participants'
	]
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
	if (!value) return fallback;
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

function resolveToolDefinition(
	tool: typeof schema.agentToolDefinition.$inferSelect,
	configOverrideRaw?: string | null
): ToolDefinitionResolved {
	return {
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
		configOverride: parseJson<Record<string, unknown> | undefined>(configOverrideRaw, undefined)
	};
}

function toWorkspaceDTO(
	workspace: typeof schema.staffAgentWorkspace.$inferSelect,
	enabledToolIds: string[]
): StaffAgentWorkspaceConfig {
	return {
		id: workspace.id,
		featureKey: STAFF_AGENT_FEATURE_KEY,
		kind: workspace.kind as StaffAgentWorkspaceKind,
		scopeType: workspace.scopeType as StaffAgentWorkspaceConfig['scopeType'],
		scopeId: workspace.scopeId,
		visibility: workspace.visibility as StaffAgentWorkspaceConfig['visibility'],
		ownerUserId: workspace.ownerUserId ?? null,
		llmRole: workspace.llmRole,
		llmInstructions: workspace.llmInstructions,
		llmContext: workspace.llmContext,
		systemPrompt: workspace.systemPrompt,
		llmModel: workspace.llmModel,
		maxToolRoundtrips: workspace.maxToolRoundtrips,
		parallelToolCalls: workspace.parallelToolCalls,
		toolChoice: workspace.toolChoice as 'auto' | 'required' | 'none',
		enabledToolIds,
		updatedAt: workspace.updatedAt.toISOString()
	};
}

function toThreadSummary(
	thread: typeof schema.staffAgentThread.$inferSelect
): StaffAgentThreadSummary {
	return {
		id: thread.id,
		workspaceId: thread.workspaceId,
		chatId: thread.chatId,
		createdByUserId: thread.createdByUserId,
		title: thread.title,
		status: thread.status as StaffAgentThreadSummary['status'],
		summary: thread.summary,
		lastMessageAt: thread.lastMessageAt ? thread.lastMessageAt.toISOString() : null,
		createdAt: thread.createdAt.toISOString(),
		updatedAt: thread.updatedAt.toISOString()
	};
}

function buildWorkspaceKey(params: {
	kind: StaffAgentWorkspaceKind;
	scopeType: typeof STAFF_AGENT_SCOPE_TYPE[keyof typeof STAFF_AGENT_SCOPE_TYPE];
	scopeId: string;
	visibility?: typeof STAFF_AGENT_VISIBILITY[keyof typeof STAFF_AGENT_VISIBILITY];
	ownerUserId?: string | null;
}) {
	return [
		STAFF_AGENT_FEATURE_KEY,
		params.kind,
		params.scopeType,
		params.scopeId,
		params.visibility ?? STAFF_AGENT_VISIBILITY.SHARED,
		params.ownerUserId ?? 'shared'
	].join(':');
}

export default class DBStaffAgentUtils {
	static getAllowedToolNames(kind: StaffAgentWorkspaceKind): string[] {
		return ALLOWED_TOOL_NAMES_BY_KIND[kind];
	}

	static async getWorkspaceById(workspaceId: string) {
		const [workspace] = await db
			.select()
			.from(schema.staffAgentWorkspace)
			.where(
				and(
					eq(schema.staffAgentWorkspace.id, workspaceId),
					eq(schema.staffAgentWorkspace.featureKey, STAFF_AGENT_FEATURE_KEY)
				)
			);
		return workspace ?? null;
	}

	static async getWorkspaceForCourse(courseId: string) {
		const [workspace] = await db
			.select()
			.from(schema.staffAgentWorkspace)
			.where(
				and(
					eq(schema.staffAgentWorkspace.featureKey, STAFF_AGENT_FEATURE_KEY),
					eq(schema.staffAgentWorkspace.kind, schema.staffAgentWorkspaceKind.COURSE),
					eq(schema.staffAgentWorkspace.scopeType, STAFF_AGENT_SCOPE_TYPE.COURSE),
					eq(schema.staffAgentWorkspace.scopeId, courseId),
					eq(schema.staffAgentWorkspace.visibility, STAFF_AGENT_VISIBILITY.SHARED)
				)
			);
		return workspace ?? null;
	}

	static async getWorkspaceForActivity(activityId: string) {
		const [workspace] = await db
			.select()
			.from(schema.staffAgentWorkspace)
			.where(
				and(
					eq(schema.staffAgentWorkspace.featureKey, STAFF_AGENT_FEATURE_KEY),
					eq(schema.staffAgentWorkspace.kind, schema.staffAgentWorkspaceKind.ACTIVITY),
					eq(schema.staffAgentWorkspace.scopeType, STAFF_AGENT_SCOPE_TYPE.ACTIVITY),
					eq(schema.staffAgentWorkspace.scopeId, activityId),
					eq(schema.staffAgentWorkspace.visibility, STAFF_AGENT_VISIBILITY.SHARED)
				)
			);
		return workspace ?? null;
	}

	static async resolveCourseIdForActivity(activityId: string): Promise<string | null> {
		const [relation] = await db
			.select({ courseId: schema.courseInteractiveLearning.courseId })
			.from(schema.courseInteractiveLearning)
			.where(eq(schema.courseInteractiveLearning.interactiveLearningId, activityId))
			.limit(1);

		return relation?.courseId ?? null;
	}

	static async resolveWorkspaceScopeContext(
		workspace: Pick<
			typeof schema.staffAgentWorkspace.$inferSelect,
			'scopeType' | 'scopeId' | 'visibility' | 'ownerUserId'
		>
	) {
		if (workspace.scopeType === STAFF_AGENT_SCOPE_TYPE.COURSE) {
			return {
				courseId: workspace.scopeId,
				interactiveLearningId: null
			};
		}

		if (workspace.scopeType === STAFF_AGENT_SCOPE_TYPE.ACTIVITY) {
			return {
				courseId: await this.resolveCourseIdForActivity(workspace.scopeId),
				interactiveLearningId: workspace.scopeId
			};
		}

		return {
			courseId: null,
			interactiveLearningId: null
		};
	}

	private static async createWorkspace(params: {
		kind: StaffAgentWorkspaceKind;
		scopeType: typeof STAFF_AGENT_SCOPE_TYPE[keyof typeof STAFF_AGENT_SCOPE_TYPE];
		scopeId: string;
		visibility?: typeof STAFF_AGENT_VISIBILITY[keyof typeof STAFF_AGENT_VISIBILITY];
		ownerUserId?: string | null;
	}) {
		await DBAgentToolUtils.seedBuiltinTools();

		const now = new Date();
		const llmModel = await ModelResolver.getDefaultModel();
		const llmRole =
			params.kind === 'course_staff'
				? 'Asistente docente de curso'
				: 'Asistente docente de actividad';
		const llmInstructions =
			params.kind === 'course_staff'
				? 'Ayuda al staff a entender el estado del curso, detectar alumnos destacados o en riesgo y responder con evidencia.'
				: 'Ayuda al staff a entender la participación y el desempeño en esta actividad usando evidencia recuperada.';
		const llmContext =
			params.kind === 'course_staff'
				? 'Mantén el foco en el curso completo. Distingue siempre hechos observados de inferencias.'
				: 'Mantén el foco en la actividad actual y en cómo se relaciona con el curso cuando sea relevante.';

		const workspaceId = nanoid();
		await db.insert(schema.staffAgentWorkspace).values({
			id: workspaceId,
			workspaceKey: buildWorkspaceKey(params),
			featureKey: STAFF_AGENT_FEATURE_KEY,
			kind: params.kind,
			scopeType: params.scopeType,
			scopeId: params.scopeId,
			visibility: params.visibility ?? STAFF_AGENT_VISIBILITY.SHARED,
			ownerUserId: params.ownerUserId ?? null,
			llmModel,
			llmRole,
			llmInstructions,
			llmContext,
			systemPrompt: null,
			maxToolRoundtrips: 8,
			parallelToolCalls: false,
			toolChoice: 'auto',
			metadata: null,
			createdAt: now,
			updatedAt: now
		});

		const allowedNames = this.getAllowedToolNames(params.kind);
		const activeTools = await DBAgentToolUtils.getActiveToolDefinitions();
		const defaultToolIds = activeTools
			.filter((tool) => allowedNames.includes(tool.name))
			.map((tool) => tool.id);

		if (defaultToolIds.length > 0) {
			await db.insert(schema.staffAgentWorkspaceTool).values(
				defaultToolIds.map((toolId) => ({
					id: nanoid(),
					workspaceId,
					toolDefinitionId: toolId,
					isEnabled: true,
					configOverride: null,
					createdAt: now
				}))
			);
		}

		const created = await this.getWorkspaceById(workspaceId);
		if (!created) {
			throw new Error('No se pudo crear el workspace de staff-agent');
		}

		return created;
	}

	static async getOrCreateCourseWorkspace(courseId: string) {
		const existing = await this.getWorkspaceForCourse(courseId);
		if (existing) return existing;
		return this.createWorkspace({
			kind: schema.staffAgentWorkspaceKind.COURSE,
			scopeType: STAFF_AGENT_SCOPE_TYPE.COURSE,
			scopeId: courseId
		});
	}

	static async getOrCreateActivityWorkspace(activityId: string, _courseId?: string) {
		const existing = await this.getWorkspaceForActivity(activityId);
		if (existing) return existing;
		return this.createWorkspace({
			kind: schema.staffAgentWorkspaceKind.ACTIVITY,
			scopeType: STAFF_AGENT_SCOPE_TYPE.ACTIVITY,
			scopeId: activityId
		});
	}

	static async updateWorkspace(
		workspaceId: string,
		updates: Partial<typeof schema.staffAgentWorkspace.$inferInsert>
	) {
		await db
			.update(schema.staffAgentWorkspace)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(schema.staffAgentWorkspace.id, workspaceId));
	}

	static async getEnabledToolsForWorkspace(workspaceId: string): Promise<ToolDefinitionResolved[]> {
		const workspace = await this.getWorkspaceById(workspaceId);
		if (!workspace) return [];

		const allowedNames = new Set(this.getAllowedToolNames(workspace.kind as StaffAgentWorkspaceKind));
		const rows = await db
			.select({
				tool: schema.agentToolDefinition,
				workspaceTool: schema.staffAgentWorkspaceTool
			})
			.from(schema.staffAgentWorkspaceTool)
			.innerJoin(
				schema.agentToolDefinition,
				eq(schema.staffAgentWorkspaceTool.toolDefinitionId, schema.agentToolDefinition.id)
			)
			.where(
				and(
					eq(schema.staffAgentWorkspaceTool.workspaceId, workspaceId),
					eq(schema.staffAgentWorkspaceTool.isEnabled, true),
					eq(schema.agentToolDefinition.isActive, true)
				)
			)
			.orderBy(asc(schema.agentToolDefinition.category), asc(schema.agentToolDefinition.name));

		return rows
			.filter(({ tool }) => allowedNames.has(tool.name))
			.map(({ tool, workspaceTool }) => resolveToolDefinition(tool, workspaceTool.configOverride));
	}

	static async setWorkspaceTools(workspaceId: string, toolIds: string[]) {
		const workspace = await this.getWorkspaceById(workspaceId);
		if (!workspace) {
			throw new Error('Workspace no encontrado');
		}

		const allowedNames = new Set(this.getAllowedToolNames(workspace.kind as StaffAgentWorkspaceKind));
		const activeTools = await DBAgentToolUtils.getActiveToolDefinitions();
		const allowedToolIds = activeTools
			.filter((tool) => allowedNames.has(tool.name))
			.map((tool) => tool.id);
		const normalizedToolIds = [...new Set(toolIds.filter((toolId) => allowedToolIds.includes(toolId)))];

		await db
			.delete(schema.staffAgentWorkspaceTool)
			.where(eq(schema.staffAgentWorkspaceTool.workspaceId, workspaceId));

		if (normalizedToolIds.length === 0) return;

		const now = new Date();
		await db.insert(schema.staffAgentWorkspaceTool).values(
			normalizedToolIds.map((toolId) => ({
				id: nanoid(),
				workspaceId,
				toolDefinitionId: toolId,
				isEnabled: true,
				configOverride: null,
				createdAt: now
			}))
		);
	}

	static async getWorkspaceConfigDTO(workspaceId: string): Promise<StaffAgentWorkspaceConfig> {
		const workspace = await this.getWorkspaceById(workspaceId);
		if (!workspace) {
			throw new Error('Workspace no encontrado');
		}

		const tools = await this.getEnabledToolsForWorkspace(workspaceId);
		return toWorkspaceDTO(workspace, tools.map((tool) => tool.id));
	}

	static async createThread(params: {
		workspaceId: string;
		userId: string;
		title?: string | null;
	}) {
		const workspace = await this.getWorkspaceById(params.workspaceId);
		if (!workspace) {
			throw new Error('Workspace no encontrado');
		}

		const now = new Date();
		const chatId = nanoid();
		const threadId = nanoid();

		await db.insert(schema.chat).values({
			id: chatId,
			userId: params.userId,
			title: params.title?.trim() || 'Nuevo hilo',
			metadata: JSON.stringify({
				kind: 'agent_thread',
				featureKey: workspace.featureKey,
				scopeType: workspace.scopeType,
				scopeId: workspace.scopeId,
				workspaceId: workspace.id
			}),
			createdAt: now,
			updatedAt: now
		});

		await db.insert(schema.staffAgentThread).values({
			id: threadId,
			workspaceId: workspace.id,
			chatId,
			createdByUserId: params.userId,
			title: params.title?.trim() || null,
			status: schema.staffAgentThreadStatus.DRAFT,
			summary: null,
			lastMessageAt: null,
			deletedAt: null,
			deletedByUserId: null,
			metadata: null,
			createdAt: now,
			updatedAt: now
		});

		const created = await this.getThread(threadId);
		if (!created) {
			throw new Error('No se pudo crear el hilo');
		}

		return created;
	}

	static async getThread(threadId: string) {
		const [thread] = await db
			.select()
			.from(schema.staffAgentThread)
			.where(eq(schema.staffAgentThread.id, threadId));
		return thread ?? null;
	}

	static async getThreadByChatId(chatId: string) {
		const [thread] = await db
			.select()
			.from(schema.staffAgentThread)
			.where(eq(schema.staffAgentThread.chatId, chatId));
		return thread ?? null;
	}

	static async getThreadWithWorkspace(threadId: string) {
		const [row] = await db
			.select({
				thread: schema.staffAgentThread,
				workspace: schema.staffAgentWorkspace,
				chat: schema.chat
			})
			.from(schema.staffAgentThread)
			.innerJoin(
				schema.staffAgentWorkspace,
				eq(schema.staffAgentThread.workspaceId, schema.staffAgentWorkspace.id)
			)
			.innerJoin(schema.chat, eq(schema.staffAgentThread.chatId, schema.chat.id))
			.where(
				and(
					eq(schema.staffAgentThread.id, threadId),
					eq(schema.staffAgentWorkspace.featureKey, STAFF_AGENT_FEATURE_KEY)
				)
			);
		return row ?? null;
	}

	static async listThreadsForWorkspace(workspaceId: string): Promise<StaffAgentThreadSummary[]> {
		const rows = await db
			.select()
			.from(schema.staffAgentThread)
			.where(
				and(
					eq(schema.staffAgentThread.workspaceId, workspaceId),
					isNull(schema.staffAgentThread.deletedAt)
				)
			)
			.orderBy(desc(schema.staffAgentThread.updatedAt), desc(schema.staffAgentThread.createdAt));

		return rows.map((thread) => toThreadSummary(thread));
	}

	static async updateThread(
		threadId: string,
		updates: Partial<typeof schema.staffAgentThread.$inferInsert>
	) {
		await db
			.update(schema.staffAgentThread)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(schema.staffAgentThread.id, threadId));
	}

	static async touchThread(
		threadId: string,
		updates?: Partial<typeof schema.staffAgentThread.$inferInsert>
	) {
		await this.updateThread(threadId, {
			lastMessageAt: new Date(),
			...updates
		});
	}

	static async renameThread(threadId: string, title: string | null) {
		await this.updateThread(threadId, { title: title?.trim() || null });

		const thread = await this.getThread(threadId);
		if (thread) {
			await db
				.update(schema.chat)
				.set({
					title: title?.trim() || 'Nuevo hilo',
					updatedAt: new Date()
				})
				.where(eq(schema.chat.id, thread.chatId));
		}
	}

	static async softDeleteThread(threadId: string, deletedByUserId: string) {
		await this.updateThread(threadId, {
			deletedAt: new Date(),
			deletedByUserId
		});
	}
}
