import type { BuiltinToolHandler, BuiltinToolPackage, ToolManifest } from './types';
import {
	calculateExpressionPackage,
	getActivityEvidenceOverviewPackage,
	getActivityTranscriptsPackage,
	getCourseStudentRosterPackage,
	getStudentProgressPackage,
	renderFlashcardsPackage,
	renderGraphPlotPackage,
	renderQuizPackage,
	renderSharedImagePackage,
	renderTimedQuizPackage,
	saveGradePackage,
	searchCourseContentPackage,
	sendNotificationPackage
} from './index';

const ALL_TOOL_PACKAGES: BuiltinToolPackage[] = [
	searchCourseContentPackage,
	getStudentProgressPackage,
	calculateExpressionPackage,
	getCourseStudentRosterPackage,
	getActivityEvidenceOverviewPackage,
	getActivityTranscriptsPackage,
	saveGradePackage,
	renderQuizPackage,
	renderTimedQuizPackage,
	renderFlashcardsPackage,
	renderGraphPlotPackage,
	renderSharedImagePackage,
	sendNotificationPackage
];

export const BUILTIN_TOOL_MANIFESTS: ToolManifest[] = ALL_TOOL_PACKAGES.map((item) => item.manifest);

export const BUILTIN_TOOL_HANDLER_REGISTRY = Object.fromEntries(
	ALL_TOOL_PACKAGES.filter((entry): entry is BuiltinToolPackage & { handler: BuiltinToolHandler } =>
		typeof entry.handler === 'function'
	).map((entry) => [entry.manifest.executorConfig.handler, entry.handler])
) as Record<string, BuiltinToolHandler>;

const BUILTIN_TOOL_BY_NAME = new Map<string, ToolManifest>(
	BUILTIN_TOOL_MANIFESTS.map((manifest) => [manifest.name, manifest])
);

export function getBuiltinToolHandler(handlerName: string): BuiltinToolHandler | null {
	return BUILTIN_TOOL_HANDLER_REGISTRY[handlerName] ?? null;
}

export function getBuiltinToolManifest(toolName: string): ToolManifest | null {
	return BUILTIN_TOOL_BY_NAME.get(toolName) ?? null;
}

export function getBuiltinToolManifestsByDomain(usageDomain: string): ToolManifest[] {
	return BUILTIN_TOOL_MANIFESTS.filter((manifest) => manifest.usageDomain === usageDomain);
}

export function getAllBuiltinToolManifests(): ToolManifest[] {
	return BUILTIN_TOOL_MANIFESTS;
}
