import type { AgentContext } from '$lib/types/agent';

export type MemoryCanvasScopeType =
	| 'student_activity'
	| 'student_course'
	| 'course_shared'
	| 'system_global';

export type MemoryCanvasVisibility = 'student_private' | 'course_internal' | 'system_internal';

export type MemoryCanvasSyncStatus = 'updated' | 'unchanged' | 'failed';

export interface MemoryCanvasScopeResolved {
	scopeType: MemoryCanvasScopeType;
	scopeKey: string;
	courseId: string | null;
	activityId: string | null;
	studentId: string | null;
	visibility: MemoryCanvasVisibility;
	scopeBindings: Record<string, string>;
}

export interface MemoryCanvasReadInput {
	reason?: string;
}

export interface MemoryCanvasUpdateInput {
	focus?: string;
	reason?: string;
}

export interface MemoryCanvasReadToolResult {
	scopeType: MemoryCanvasScopeType;
	scopeKey: string;
	visibility: MemoryCanvasVisibility;
	scopeBindings: Record<string, string>;
	exists: boolean;
	content: string | null;
	revision: number | null;
	updatedAt: string | null;
}

export interface MemoryCanvasUpdateToolResult {
	scopeType: MemoryCanvasScopeType;
	scopeKey: string;
	visibility: MemoryCanvasVisibility;
	scopeBindings: Record<string, string>;
	status: MemoryCanvasSyncStatus;
	stored: boolean;
	changed: boolean;
	changeSummary: string | null;
	revision: number | null;
	updatedAt: string | null;
}

export interface AgentMemoryCanvasRecord {
	id: string;
	scopeType: MemoryCanvasScopeType;
	scopeKey: string;
	courseId: string | null;
	activityId: string | null;
	studentId: string | null;
	visibility: MemoryCanvasVisibility;
	scopeBindings: Record<string, string>;
	content: string;
	revision: number;
	lastSourceChatId: string | null;
	lastSourceToolCallId: string | null;
	lastModelName: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface AgentMemoryCanvasRevisionRecord {
	id: string;
	canvasId: string;
	scopeType: MemoryCanvasScopeType;
	scopeKey: string;
	courseId: string | null;
	activityId: string | null;
	studentId: string | null;
	visibility: MemoryCanvasVisibility;
	scopeBindings: Record<string, string>;
	revision: number;
	content: string;
	changeSummary: string | null;
	sourceEventType: 'sync_update';
	sourceChatId: string | null;
	sourceToolCallId: string | null;
	modelName: string | null;
	createdAt: Date;
}

export interface AgentMemoryCanvasSyncEventRecord {
	id: string;
	canvasId: string | null;
	scopeType: MemoryCanvasScopeType;
	scopeKey: string;
	courseId: string | null;
	activityId: string | null;
	studentId: string | null;
	visibility: MemoryCanvasVisibility;
	scopeBindings: Record<string, string>;
	chatId: string | null;
	toolCallId: string | null;
	modelName: string | null;
	status: MemoryCanvasSyncStatus;
	changeSummary: string | null;
	errorMessage: string | null;
	createdAt: Date;
}

export interface CanvasScopeProfile {
	id: string;
	scopeType: MemoryCanvasScopeType;
	readToolName: string;
	updateToolName: string;
	visibility: MemoryCanvasVisibility;
	usageDomains: string[];
	promptHeading: string;
	updateScopeLabel: string;
	requiresFinalizationGuard: boolean;
	canResolve(context: AgentContext): boolean;
	resolve(context: AgentContext): MemoryCanvasScopeResolved;
	buildTemplate(): string;
}
