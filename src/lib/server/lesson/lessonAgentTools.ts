import type { ToolDefinitionResolved } from '$lib/types/agent';
import DBAgentToolUtils from '$lib/server/db/agent/DBAgentToolUtils';
import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '$lib/server/agent/tools/constants';
import { getBuiltinToolManifestsByDomain } from '$lib/server/agent/tools/registry';

const EXPLICIT_LESSON_SAFE_TOOL_NAMES = new Set([
	'calculate_expression',
	'search_course_content',
	'get_student_progress',
	'save_grade',
	'send_notification'
]);

export interface LessonAgentToolCatalogItem {
	id: string;
	name: string;
	displayName: string;
	description: string;
	category: string;
	riskLevel: 'low' | 'medium' | 'high';
	requiresConfirmation: boolean;
	executorType: 'builtin' | 'http' | 'script';
	executorConfig: Record<string, unknown>;
	isInteractiveUi: boolean;
	isPersistent: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseExecutorConfig(raw: string | null | undefined): Record<string, unknown> {
	if (!raw) return {};

	try {
		const parsed = JSON.parse(raw) as unknown;
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function sortCatalogItems(items: LessonAgentToolCatalogItem[]): LessonAgentToolCatalogItem[] {
	return [...items].sort(
		(left, right) =>
			left.category.localeCompare(right.category, 'es') ||
			left.displayName.localeCompare(right.displayName, 'es')
	);
}

export function isLessonSafeAgentToolName(name: string): boolean {
	return name.startsWith('render_') || EXPLICIT_LESSON_SAFE_TOOL_NAMES.has(name);
}

export function getAllLessonSafeAgentToolIds(): string[] {
	return getBuiltinToolManifestsByDomain(BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT)
		.filter((manifest) => isLessonSafeAgentToolName(manifest.name))
		.map((manifest) => manifest.name)
		.sort((left, right) => left.localeCompare(right, 'es'));
}

export function getEffectiveLessonAllowedToolIds(
	allowedAgentToolIds: string[] | undefined
): string[] {
	return allowedAgentToolIds && allowedAgentToolIds.length > 0
		? [...allowedAgentToolIds]
		: getAllLessonSafeAgentToolIds();
}

export async function getLessonAgentToolCatalog(): Promise<LessonAgentToolCatalogItem[]> {
	let toolDefinitions = await DBAgentToolUtils.getActiveToolDefinitions(
		BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
	);

	if (toolDefinitions.length === 0) {
		await DBAgentToolUtils.seedBuiltinTools(BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT);
		toolDefinitions = await DBAgentToolUtils.getActiveToolDefinitions(
			BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
		);
	}

	return sortCatalogItems(
		toolDefinitions
			.filter((tool) => isLessonSafeAgentToolName(tool.name))
			.map((tool) => {
				const executorConfig = parseExecutorConfig(tool.executorConfig);
				const handler = typeof executorConfig.handler === 'string' ? executorConfig.handler : null;

				return {
					id: tool.name,
					name: tool.name,
					displayName: tool.displayName,
					description: tool.description,
					category: tool.category,
					riskLevel: tool.riskLevel as LessonAgentToolCatalogItem['riskLevel'],
					requiresConfirmation: tool.requiresConfirmation,
					executorType: tool.executorType as LessonAgentToolCatalogItem['executorType'],
					executorConfig,
					isInteractiveUi: handler === 'ui_renderer',
					isPersistent: tool.name === 'save_grade' || tool.name === 'send_notification'
				} satisfies LessonAgentToolCatalogItem;
			})
	);
}

export async function resolveLessonAgentTools(input: {
	allowedAgentToolIds?: string[];
	enabledToolIds?: string[];
}): Promise<ToolDefinitionResolved[]> {
	const allowedIds = new Set(getEffectiveLessonAllowedToolIds(input.allowedAgentToolIds));
	const enabledIds =
		input.enabledToolIds && input.enabledToolIds.length > 0
			? new Set(input.enabledToolIds.filter((toolId) => allowedIds.has(toolId)))
			: null;

	let toolDefinitions = await DBAgentToolUtils.getActiveToolDefinitions(
		BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
	);
	if (toolDefinitions.length === 0) {
		await DBAgentToolUtils.seedBuiltinTools(BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT);
		toolDefinitions = await DBAgentToolUtils.getActiveToolDefinitions(
			BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
		);
	}

	return toolDefinitions
		.filter((tool) => allowedIds.has(tool.name))
		.filter((tool) => (enabledIds ? enabledIds.has(tool.name) : true))
		.map((tool) => ({
			id: tool.id,
			name: tool.name,
			displayName: tool.displayName,
			description: tool.description,
			category: tool.category,
			parametersSchema: parseExecutorConfig(tool.parametersSchema),
			responseSchema: tool.responseSchema ? parseExecutorConfig(tool.responseSchema) : undefined,
			executorType: tool.executorType as ToolDefinitionResolved['executorType'],
			executorConfig: parseExecutorConfig(tool.executorConfig),
			requiresConfirmation: tool.requiresConfirmation,
			riskLevel: tool.riskLevel as ToolDefinitionResolved['riskLevel'],
			usageDomain: tool.usageDomain ?? undefined,
			configOverride: undefined
		}));
}
