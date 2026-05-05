import type {
	LessonDefinitionBindingStatusType,
	LessonRevisionStatusType,
	LessonSessionScopeType
} from '$lib/server/db/schema';

export interface LessonRevisionSummary {
	id: string;
	revisionNumber: number;
	status: LessonRevisionStatusType;
	publishedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface LessonRevisionDiffSummary {
	entryBlockChanged: boolean;
	addedBlockIds: string[];
	removedBlockIds: string[];
	changedBlockIds: string[];
	totalChangedBlocks: number;
}

export interface LessonRevisionImpactSummary {
	activeAttemptsOnCurrentPublishedRevision: number;
	activeAttemptsOnOlderRevisions: number;
	completedAttemptsOnHistoricalRevisions: number;
	revisionsReferencedByLearnerAttempts: number;
	referencedAssetFileIds: string[];
}

export interface LessonRevisionAdminSummary {
	published: LessonRevisionSummary;
	draft: LessonRevisionSummary;
	diff: LessonRevisionDiffSummary;
	impact: LessonRevisionImpactSummary;
}

export interface LessonSessionRevisionInfo {
	revisionId: string | null;
	revisionNumber: number | null;
	bindingStatus: LessonDefinitionBindingStatusType;
	scope: LessonSessionScopeType;
	scopeLabel: string;
	isPreview: boolean;
	isHistoricalApproximation: boolean;
}
