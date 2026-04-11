import type { BuiltinToolHandler, BuiltinToolPackage, ToolManifest } from './types';
import {
	analyzeActivityDifficultyPackage,
	analyzeToolFrictionHotspotsPackage,
	calculateExpressionPackage,
	clusterInteractionPatternsPackage,
	compareStudentGroupsPackage,
	courseSharedCanvasReadPackage,
	courseSharedCanvasUpdatePackage,
	draftOutreachMessagePackage,
	draftRemediationPlanPackage,
	draftStudentNotificationPackage,
	draftTeacherFeedbackPackage,
	detectActivityMisconceptionsPackage,
	findStuckSessionsPackage,
	findInconsistentGradingCasesPackage,
	forecastCompletionRiskPackage,
	getActivityParticipantsPackage,
	getActivityDropoutFunnelPackage,
	getActivityNonStartersPackage,
	getActivityToolUsageSummaryPackage,
	getActivityEvidenceOverviewPackage,
	getActivityTranscriptsPackage,
	getCourseActivityOverviewPackage,
	getCourseSequenceBottlenecksPackage,
	getCourseStudentRosterPackage,
	getCourseStudentSignalsPackage,
	getLearningProgressTimelinePackage,
	getRubricCoverageGapsPackage,
	getStudentAttemptHistoryPackage,
	getStudentProgressPackage,
	getTeacherInterventionQueuePackage,
	measureResponseDepthPackage,
	recommendNextActivityPackage,
	recommendGroupInterventionsPackage,
	renderAttentionControlTestPackage,
	renderDrivingPsychotechTestPackage,
	renderExecutiveFlexibilityTestPackage,
	renderFlashcardsPackage,
	renderGraphPlotPackage,
	renderImmersiveTimedQuizPackage,
	renderQuizPackage,
	renderSharedImagePackage,
	renderSvgDiagramPackage,
	renderSustainedAttentionTestPackage,
	renderTikzjaxBrowserDiagramPackage,
	renderTimedQuizPackage,
	renderWorkingMemoryTestPackage,
	rubricEvaluateResponsePackage,
	saveGradePackage,
	searchCourseContentPackage,
	sendNotificationPackage,
	studentActivityCanvasReadPackage,
	studentActivityCanvasUpdatePackage,
	studentCourseCanvasReadPackage,
	studentCourseCanvasUpdatePackage,
	summarizeEvidenceForStudentPackage,
	systemGlobalCanvasReadPackage,
	systemGlobalCanvasUpdatePackage
} from './index';

const ALL_TOOL_PACKAGES: BuiltinToolPackage[] = [
	searchCourseContentPackage,
	getStudentProgressPackage,
	calculateExpressionPackage,
	getCourseStudentRosterPackage,
	getActivityNonStartersPackage,
	getActivityDropoutFunnelPackage,
	getActivityEvidenceOverviewPackage,
	getActivityTranscriptsPackage,
	getActivityParticipantsPackage,
	getCourseActivityOverviewPackage,
	getCourseSequenceBottlenecksPackage,
	getCourseStudentSignalsPackage,
	getLearningProgressTimelinePackage,
	getStudentAttemptHistoryPackage,
	getActivityToolUsageSummaryPackage,
	analyzeToolFrictionHotspotsPackage,
	studentCourseCanvasReadPackage,
	studentCourseCanvasUpdatePackage,
	studentActivityCanvasReadPackage,
	studentActivityCanvasUpdatePackage,
	courseSharedCanvasReadPackage,
	courseSharedCanvasUpdatePackage,
	systemGlobalCanvasReadPackage,
	systemGlobalCanvasUpdatePackage,
	compareStudentGroupsPackage,
	findStuckSessionsPackage,
	analyzeActivityDifficultyPackage,
	summarizeEvidenceForStudentPackage,
	draftTeacherFeedbackPackage,
	draftRemediationPlanPackage,
	recommendNextActivityPackage,
	draftOutreachMessagePackage,
	draftStudentNotificationPackage,
	forecastCompletionRiskPackage,
	clusterInteractionPatternsPackage,
	findInconsistentGradingCasesPackage,
	detectActivityMisconceptionsPackage,
	measureResponseDepthPackage,
	getRubricCoverageGapsPackage,
	rubricEvaluateResponsePackage,
	saveGradePackage,
	renderQuizPackage,
	renderTimedQuizPackage,
	renderFlashcardsPackage,
	renderGraphPlotPackage,
	renderImmersiveTimedQuizPackage,
	renderAttentionControlTestPackage,
	renderDrivingPsychotechTestPackage,
	renderExecutiveFlexibilityTestPackage,
	renderSharedImagePackage,
	renderSvgDiagramPackage,
	renderSustainedAttentionTestPackage,
	renderTikzjaxBrowserDiagramPackage,
	renderWorkingMemoryTestPackage,
	getTeacherInterventionQueuePackage,
	recommendGroupInterventionsPackage,
	sendNotificationPackage,
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
