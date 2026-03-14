import type { AgentContext } from '$lib/types/agent';
import type { MemoryCanvasScopeResolved } from '$lib/types/agentMemory';
import {
	ACTIVITY_CANVAS_TOOL_NAMES,
	COURSE_CANVAS_TOOL_NAMES
} from './constants';

export class MemoryScopeResolver {
	static resolve(context: AgentContext, toolName: string): MemoryCanvasScopeResolved {
		const coursePart = context.courseId ?? 'none';

		if (COURSE_CANVAS_TOOL_NAMES.includes(toolName as (typeof COURSE_CANVAS_TOOL_NAMES)[number])) {
			return {
				scopeType: 'student_course',
				scopeKey: `student:${context.userId}:course:${coursePart}`,
				courseId: context.courseId ?? null,
				activityId: context.activityId ?? null,
				studentId: context.userId
			};
		}

		if (
			!ACTIVITY_CANVAS_TOOL_NAMES.includes(toolName as (typeof ACTIVITY_CANVAS_TOOL_NAMES)[number])
		) {
			throw new Error(`Herramienta de memoria no soportada: ${toolName}`);
		}

		return {
			scopeType: 'student_activity',
			scopeKey: `student:${context.userId}:course:${coursePart}:activity:${context.activityId}`,
			courseId: context.courseId ?? null,
			activityId: context.activityId,
			studentId: context.userId
		};
	}
}
