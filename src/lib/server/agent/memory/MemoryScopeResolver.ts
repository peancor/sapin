import type { AgentContext } from '$lib/types/agent';
import type { MemoryScopeResolved } from '$lib/types/agentMemory';

export class MemoryScopeResolver {
	static resolve(context: AgentContext, _toolName: string): MemoryScopeResolved {
		const coursePart = context.courseId ?? 'none';

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
