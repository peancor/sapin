import type {
	LessonAttemptStatus,
	LessonBlockKind,
	LessonBlockVisitStatus
} from '$lib/types/lesson';

export type LessonReviewAttemptStatus = 'completed' | 'active' | 'attention';

export type LessonReviewAlertKind =
	| 'checkpoint_blocked'
	| 'repeated_retry'
	| 'looping_path'
	| 'abandoned_attempt'
	| 'branch_complexity';

export interface LessonReviewAlert {
	kind: LessonReviewAlertKind;
	label: string;
	description: string;
	severity: 'info' | 'warning' | 'critical';
}

export interface LessonReviewAttemptSummary {
	sessionId: string;
	userId: string;
	attemptNumber: number;
	sessionStatus: LessonAttemptStatus;
	reviewStatus: LessonReviewAttemptStatus;
	currentBlockId: string;
	currentBlockTitle: string;
	currentBlockKind: LessonBlockKind;
	startedAt: Date;
	lastActiveAt: Date;
	completedAt: Date | null;
	visitedBlocksCount: number;
	completedBlocksCount: number;
	totalBlocks: number;
	totalVisits: number;
	branchCount: number;
	checksPassed: number;
	checksPending: number;
	checkRetryBlocks: number;
	revisitedBlocks: number;
	hasAgentBlocks: boolean;
	alerts: LessonReviewAlert[];
}

export interface LessonReviewStudent {
	id: string;
	username: string;
	email: string | null;
	image: string | null;
	alias: string | null;
}

export interface LessonReviewStudentRow {
	student: LessonReviewStudent;
	latestAttempt: LessonReviewAttemptSummary | null;
	previousAttempts: LessonReviewAttemptSummary[];
	totalAttempts: number;
	hasAnyActivity: boolean;
}

export interface LessonReviewVisitAgentMessage {
	id: string;
	role: 'USER' | 'ASSISTANT';
	content: string;
	createdAt: Date;
}

export interface LessonReviewVisitDetail {
	visitId: string;
	visitNumber: number;
	blockId: string;
	blockTitle: string;
	blockKind: LessonBlockKind;
	status: LessonBlockVisitStatus;
	enteredAt: Date;
	completedAt: Date | null;
	branchTargetBlockId: string | null;
	branchLabel: string | null;
	contentSummary: string | null;
	choice:
		| {
				selectedLabel: string | null;
				selectedValue: string | null;
				targetBlockId: string | null;
		  }
		| null;
	check:
		| {
				score: number | null;
				passed: boolean;
				feedback: string | null;
				attemptCount: number;
				attemptsRemaining: number | null;
		  }
		| null;
	agent:
		| {
				transcript: LessonReviewVisitAgentMessage[];
				summary: string | null;
		  }
		| null;
}

export interface LessonReviewAttemptDetail {
	student: LessonReviewStudent;
	attempt: LessonReviewAttemptSummary;
	history: LessonReviewAttemptSummary[];
	timeline: LessonReviewVisitDetail[];
}
