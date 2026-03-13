import type { AgentContext } from '$lib/types/agent';
import type { MemoryScopeResolved } from '$lib/types/agentMemory';
import {
	LEGACY_MEMORY_READ_TOOL_NAME,
	LEGACY_MEMORY_WRITE_TOOL_NAME,
	MEMORY_READ_TOOL_NAME,
	MEMORY_WRITE_TOOL_NAME
} from './constants';

export class MemoryScopeResolver {
	static resolve(context: AgentContext, toolName: string): MemoryScopeResolved {
		const coursePart = context.courseId ?? 'none';

		if (toolName === MEMORY_READ_TOOL_NAME || toolName === MEMORY_WRITE_TOOL_NAME) {
			return {
				scopeType: 'student_course',
				scopeKey: `student:${context.userId}:course:${coursePart}`,
				privacyClass: 'student_private',
				courseId: context.courseId ?? null,
				activityId: context.activityId,
				subjectUserId: context.userId,
				createdByUserId: context.userId
			};
		}

		if (toolName !== LEGACY_MEMORY_READ_TOOL_NAME && toolName !== LEGACY_MEMORY_WRITE_TOOL_NAME) {
			throw new Error(`Herramienta de memoria no soportada: ${toolName}`);
		}

		return {
			scopeType: 'student_activity',
			scopeKey: `student:${context.userId}:course:${coursePart}:activity:${context.activityId}`,
			privacyClass: 'student_private',
			courseId: context.courseId ?? null,
			activityId: context.activityId,
			subjectUserId: context.userId,
			createdByUserId: context.userId
		};
	}
}
