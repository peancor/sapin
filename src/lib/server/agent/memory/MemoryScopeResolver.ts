import type { AgentContext } from '$lib/types/agent';
import type { MemoryScopeResolved } from '$lib/types/agentMemory';
import { STUDENT_ACTIVITY_MEMORY_TOOL_NAME, STUDENT_COURSE_MEMORY_TOOL_NAME } from './constants';

export class MemoryScopeResolver {
	static resolve(context: AgentContext, toolName: string): MemoryScopeResolved {
		const coursePart = context.courseId ?? 'none';

		if (toolName === STUDENT_COURSE_MEMORY_TOOL_NAME) {
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

		if (toolName !== STUDENT_ACTIVITY_MEMORY_TOOL_NAME) {
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
