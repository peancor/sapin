import { AIUtils } from '$lib/server/ai/AIUtils';
import { DBAgentToolUtils } from '$lib/server/db/agent';
import { DBStaffAgentUtils, STAFF_AGENT_SCOPE_TYPE } from '$lib/server/db/staff-agent';
import { StaffAgentAnalyticsService } from './StaffAgentAnalyticsService';
import { StaffAgentPromptBuilder } from './StaffAgentPromptBuilder';
import type { AgentContext, ToolDefinitionResolved } from '$lib/types/agent';

function mapAvailableTool(tool: Awaited<ReturnType<typeof DBAgentToolUtils.getActiveToolDefinitions>>[number]) {
	return {
		id: tool.id,
		name: tool.name,
		displayName: tool.displayName,
		description: tool.description,
		category: tool.category,
		usageDomain: tool.usageDomain,
		riskLevel: tool.riskLevel,
		requiresConfirmation: tool.requiresConfirmation
	};
}

export class StaffAgentRuntimeService {
	static async getAvailableToolsForWorkspace(workspaceId: string) {
		await DBAgentToolUtils.seedBuiltinTools();
		const workspace = await DBStaffAgentUtils.getWorkspaceById(workspaceId);
		if (!workspace) {
			throw new Error('Workspace no encontrado');
		}

		const allowedNames = new Set(
			DBStaffAgentUtils.getAllowedToolNames(workspace.kind as 'course_staff' | 'activity_staff')
		);
		return (await DBAgentToolUtils.getActiveToolDefinitions())
			.filter((tool) => allowedNames.has(tool.name))
			.map(mapAvailableTool);
	}

	static async getModels() {
		return (await AIUtils.getAvailableModels()).map((model) => model.name);
	}

	static async buildRuntime(params: {
		workspaceId: string;
		userId: string;
		userHighestRoleLevel?: number;
		chatId: string;
	}): Promise<{
		workspace: NonNullable<Awaited<ReturnType<typeof DBStaffAgentUtils.getWorkspaceById>>>;
		enabledTools: ToolDefinitionResolved[];
		systemPrompt: string;
		context: AgentContext;
		runtimeContext: Record<string, unknown>;
	}> {
		await DBAgentToolUtils.seedBuiltinTools();
		const workspace = await DBStaffAgentUtils.getWorkspaceById(params.workspaceId);
		if (!workspace) {
			throw new Error('Workspace no encontrado');
		}

		const scopeContext = await DBStaffAgentUtils.resolveWorkspaceScopeContext(workspace);
		const resolvedCourseId = scopeContext.courseId;
		const resolvedActivityId = scopeContext.interactiveLearningId;

		if (workspace.scopeType === STAFF_AGENT_SCOPE_TYPE.COURSE && !resolvedCourseId) {
			throw new Error('No se pudo resolver el curso del workspace');
		}

		if (workspace.scopeType === STAFF_AGENT_SCOPE_TYPE.ACTIVITY && !resolvedActivityId) {
			throw new Error('No se pudo resolver la actividad del workspace');
		}

		const enabledTools = await DBStaffAgentUtils.getEnabledToolsForWorkspace(workspace.id);
		const runtimeContext =
			workspace.scopeType === STAFF_AGENT_SCOPE_TYPE.COURSE
				? await StaffAgentAnalyticsService.getCoursePromptContext(
						{
							actorUserId: params.userId,
							actorHighestRoleLevel: params.userHighestRoleLevel
						},
						resolvedCourseId ?? workspace.scopeId
					)
				: await StaffAgentAnalyticsService.getActivityPromptContext(
						{
							actorUserId: params.userId,
							actorHighestRoleLevel: params.userHighestRoleLevel
						},
						resolvedActivityId ?? workspace.scopeId
					);

		const systemPrompt = StaffAgentPromptBuilder.build({
			kind: workspace.kind as 'course_staff' | 'activity_staff',
			role: workspace.llmRole,
			instructions: workspace.llmInstructions,
			context: workspace.llmContext,
			systemPrompt: workspace.systemPrompt,
			runtimeContext,
			tools: enabledTools
		});

		const context: AgentContext = {
			userId: params.userId,
			courseId: resolvedCourseId ?? undefined,
			chatId: params.chatId,
			activityId: resolvedActivityId ?? workspace.id,
			activityConfig: {
				llmModel: workspace.llmModel,
				llmRole: workspace.llmRole,
				llmInstructions: workspace.llmInstructions,
				llmContext: workspace.llmContext,
				systemPrompt: workspace.systemPrompt,
				temperature: 0.2,
				maxTokens: 2200,
				topP: null,
				maxToolRoundtrips: workspace.maxToolRoundtrips,
				parallelToolCalls: workspace.parallelToolCalls,
				toolChoice: workspace.toolChoice as 'auto' | 'required' | 'none',
				finalizationEnabled: false,
				finalizationToolName: 'finalize_staff_agent',
				finalizationHandler: 'mark_complete_only',
				finalizationConfig: null,
				requireFinalizationToolCall: false,
				ragEnabled: false,
				ragCollectionName: null,
				ragConfig: null
			},
			enabledTools,
			enabledUIComponentKeys: [],
			messageHistory: []
		};

		return {
			workspace,
			enabledTools,
			systemPrompt,
			context,
			runtimeContext
		};
	}
}

export default StaffAgentRuntimeService;
