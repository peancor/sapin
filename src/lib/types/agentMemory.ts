export type MemoryScopeType =
	| 'student_activity'
	| 'student_course'
	| 'course'
	| 'activity'
	| 'system';

export type MemoryPrivacyClass = 'student_private' | 'course_staff' | 'system_admin';

export type MemorySourceKind = 'tool' | 'agent' | 'event' | 'system';

export type MemoryStatus = 'active' | 'superseded' | 'expired' | 'rejected';

export type MemoryAccessOperation = 'read' | 'write' | 'prefetch';

export type MemoryAccessOutcome =
	| 'allowed'
	| 'validation_failed'
	| 'rejected'
	| 'ignored_scope_fields'
	| 'forbidden_memory_type';

export type MemoryType = 'student_preference' | 'activity_episode' | 'course_staff_note';

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
