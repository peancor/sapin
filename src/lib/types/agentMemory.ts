export type MemoryCanvasScopeType = 'student_activity' | 'student_course';

export type MemoryCanvasSyncStatus = 'updated' | 'unchanged' | 'failed';

export interface MemoryCanvasScopeResolved {
	scopeType: MemoryCanvasScopeType;
	scopeKey: string;
	courseId: string | null;
	activityId: string | null;
	studentId: string;
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
	exists: boolean;
	content: string | null;
	revision: number | null;
	updatedAt: string | null;
}

export interface MemoryCanvasUpdateToolResult {
	scopeType: MemoryCanvasScopeType;
	scopeKey: string;
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
	studentId: string;
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
	studentId: string;
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
	studentId: string;
	chatId: string | null;
	toolCallId: string | null;
	modelName: string | null;
	status: MemoryCanvasSyncStatus;
	changeSummary: string | null;
	errorMessage: string | null;
	createdAt: Date;
}

// Legacy typed-memory contracts kept temporarily so deprecated modules still typecheck.
export type MemoryScopeType = MemoryCanvasScopeType | 'course' | 'activity' | 'system';
export type MemoryPrivacyClass = 'student_private' | 'course_staff' | 'system_admin';
export type MemorySourceKind = 'tool' | 'agent' | 'event' | 'system';
export type MemoryStatus = 'active' | 'superseded' | 'expired' | 'rejected';
export type MemoryAccessOperation = 'read' | 'write' | 'prefetch';
export type MemoryAction = 'read' | 'write';
export type MemoryAccessOutcome =
	| 'allowed'
	| 'validation_failed'
	| 'rejected'
	| 'ignored_scope_fields'
	| 'forbidden_memory_type';
export type MemoryType =
	| 'student_preference'
	| 'activity_episode'
	| 'course_staff_note'
	| 'student_observation';

export interface MemoryScopeResolved {
	scopeType: MemoryScopeType;
	scopeKey: string;
	privacyClass: MemoryPrivacyClass;
	courseId: string | null;
	activityId: string | null;
	subjectUserId: string | null;
	createdByUserId: string | null;
}

export interface MemoryQueryInput {
	goal?: string;
	memoryTypes?: string[];
	tagsAny?: string[];
	sinceDays?: number;
	limit?: number;
	minImportance?: number;
}

export interface MemoryWriteInput {
	memoryType: string;
	summary: string;
	payload: unknown;
	importance?: number;
	occurredAt?: string;
	dedupeKey?: string;
	tags?: string[];
}

export interface UnifiedMemoryToolInput extends Partial<MemoryQueryInput>, Partial<MemoryWriteInput> {
	action: MemoryAction;
	details?: string;
	evidence?: unknown;
	confidence?: number;
}

export interface UnifiedMemoryReadResultItem {
	id: string;
	memoryType: string;
	summary: string;
	payload: unknown;
	importance: number;
	occurredAt: string | null;
	tags: string[];
}

export interface UnifiedMemoryToolResult {
	action: MemoryAction;
	ignoredScopeFields: string[];
	ignoredActionFields: string[];
	items?: UnifiedMemoryReadResultItem[];
	resultCount?: number;
	stored?: boolean;
	status?: 'active' | 'rejected';
	reason?: string;
	item?: UnifiedMemoryReadResultItem;
}

export interface AgentMemoryRecord {
	id: string;
	scopeType: MemoryScopeType;
	scopeKey: string;
	privacyClass: MemoryPrivacyClass;
	courseId: string | null;
	activityId: string | null;
	subjectUserId: string | null;
	createdByUserId: string | null;
	sourceKind: MemorySourceKind;
	memoryType: string;
	status: MemoryStatus;
	importance: number;
	dedupeKey: string | null;
	summary: string;
	tags: string[];
	payload: unknown;
	occurredAt: Date | null;
	expiresAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface AgentMemoryAccessEvent {
	id: string;
	memoryId: string | null;
	actorUserId: string | null;
	toolName: string;
	operation: MemoryAccessOperation;
	outcome: MemoryAccessOutcome;
	scopeKey: string;
	resultCount: number;
	details: Record<string, unknown> | null;
	createdAt: Date;
}
