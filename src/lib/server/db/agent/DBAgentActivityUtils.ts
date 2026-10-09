import { db } from '..';
import { eq, and } from 'drizzle-orm';
import * as schema from '../schema';
import { nanoid } from 'nanoid';
import type { ToolDefinitionResolved } from '$lib/types/agent';
import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT,
	BUILTIN_TOOL_USAGE_DOMAIN_INTERNAL
} from '$lib/server/agent/tools/constants';
import DBAgentToolUtils from './DBAgentToolUtils';
import {
	getCanvasToolNamePairs,
	isCrossDomainAgentChatMemoryTool
} from '$lib/server/agent/memory/CanvasScopeRegistry';

function normalizeCanvasToolPairs(
	enabledTools: ToolDefinitionResolved[],
	activeTools: ToolDefinitionResolved[]
): ToolDefinitionResolved[] {
	const normalized = new Map(enabledTools.map((tool) => [tool.id, tool]));
	const byName = new Map(activeTools.map((tool) => [tool.name, tool]));
	const enabledNames = new Set(enabledTools.map((tool) => tool.name));
	const memoryToolNamePairs = getCanvasToolNamePairs();

	for (const [readToolName, updateToolName] of memoryToolNamePairs) {
		if (enabledNames.has(readToolName) || enabledNames.has(updateToolName)) {
			const readTool = byName.get(readToolName);
			const updateTool = byName.get(updateToolName);
			if (readTool) normalized.set(readTool.id, readTool);
			if (updateTool) normalized.set(updateTool.id, updateTool);
		}
	}

	return Array.from(normalized.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function resolveToolDefinition(
	tool: typeof schema.agentToolDefinition.$inferSelect,
	configOverrideRaw?: string | null
): ToolDefinitionResolved {
	let parametersSchema: Record<string, unknown> = {};
	let responseSchema: Record<string, unknown> | undefined = undefined;
	let executorConfig: Record<string, unknown> = {};
	let configOverride: Record<string, unknown> | undefined = undefined;

	try {
		parametersSchema = JSON.parse(tool.parametersSchema) as Record<string, unknown>;
	} catch {
		// Use empty schema as fallback
	}
	if (tool.responseSchema) {
		try {
			responseSchema = JSON.parse(tool.responseSchema) as Record<string, unknown>;
		} catch {
			// ignore
		}
	}
	try {
		executorConfig = JSON.parse(tool.executorConfig) as Record<string, unknown>;
	} catch {
		// ignore
	}
	if (configOverrideRaw) {
		try {
			configOverride = JSON.parse(configOverrideRaw) as Record<string, unknown>;
		} catch {
			// ignore
		}
	}

	return {
		id: tool.id,
		name: tool.name,
		displayName: tool.displayName,
		description: tool.description,
		category: tool.category,
		parametersSchema,
		responseSchema,
		executorType: tool.executorType as 'builtin' | 'http' | 'script',
		executorConfig,
		requiresConfirmation: tool.requiresConfirmation,
		riskLevel: tool.riskLevel as 'low' | 'medium' | 'high',
		usageDomain: tool.usageDomain,
		configOverride
	} satisfies ToolDefinitionResolved;
}

function isToolAllowedForActivityUsageDomain(
	tool: Pick<typeof schema.agentToolDefinition.$inferSelect, 'usageDomain' | 'name'>,
	usageDomain: string
): boolean {
	if (tool.usageDomain === usageDomain || tool.usageDomain === null) {
		return true;
	}

	return (
		usageDomain === BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT &&
		tool.usageDomain === BUILTIN_TOOL_USAGE_DOMAIN_INTERNAL &&
		isCrossDomainAgentChatMemoryTool(tool.name)
	);
}

export default class DBAgentActivityUtils {
	// ─── Actividad Agéntica ───

	static async getAgentActivity(
		activityId: string
	): Promise<typeof schema.interactiveLearningAgent.$inferSelect | null> {
		const [record] = await db
			.select()
			.from(schema.interactiveLearningAgent)
			.where(eq(schema.interactiveLearningAgent.id, activityId));
		return record ?? null;
	}

	static async createAgentActivity(data: typeof schema.interactiveLearningAgent.$inferInsert) {
		return await db.insert(schema.interactiveLearningAgent).values(data);
	}

	static async updateAgentActivity(
		activityId: string,
		data: Partial<typeof schema.interactiveLearningAgent.$inferInsert>
	) {
		return await db
			.update(schema.interactiveLearningAgent)
			.set(data)
			.where(eq(schema.interactiveLearningAgent.id, activityId));
	}

	// ─── Herramientas Habilitadas por Actividad ───

	static async getEnabledToolsForActivity(
		activityId: string,
		usageDomain: string = BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
	): Promise<ToolDefinitionResolved[]> {
		const rows = await db
			.select({
				tool: schema.agentToolDefinition,
				activityTool: schema.agentActivityTool
			})
			.from(schema.agentActivityTool)
			.innerJoin(
				schema.agentToolDefinition,
				eq(schema.agentActivityTool.toolDefinitionId, schema.agentToolDefinition.id)
			)
			.where(
				and(
					eq(schema.agentActivityTool.agentActivityId, activityId),
					eq(schema.agentActivityTool.isEnabled, true),
					eq(schema.agentToolDefinition.isActive, true)
				)
			);

		const resolvedTools = rows
			.filter((row) => isToolAllowedForActivityUsageDomain(row.tool, usageDomain))
			.map((row) => resolveToolDefinition(row.tool, row.activityTool.configOverride));

		const activeTools = (await DBAgentToolUtils.getActiveToolDefinitions()).map((tool) =>
			resolveToolDefinition(tool)
		);
		return normalizeCanvasToolPairs(resolvedTools, activeTools);
	}

	static async setActivityTools(activityId: string, toolIds: string[]) {
		// Eliminar las existentes
		await db
			.delete(schema.agentActivityTool)
			.where(eq(schema.agentActivityTool.agentActivityId, activityId));

		// Insertar las nuevas
		if (toolIds.length > 0) {
			await db.insert(schema.agentActivityTool).values(
				toolIds.map((toolId) => ({
					id: nanoid(),
					agentActivityId: activityId,
					toolDefinitionId: toolId,
					isEnabled: true,
					createdAt: new Date()
				}))
			);
		}
	}
}
