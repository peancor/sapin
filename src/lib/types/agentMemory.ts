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
