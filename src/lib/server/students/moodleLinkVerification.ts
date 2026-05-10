import { eq } from 'drizzle-orm';
import { CourseRoleUtils, db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { ROLE_LEVELS } from '$lib/server/roles';
import {
	resolveExternalIdSearchParamDetail,
	type ExternalIdSearchParam
} from './externalIdSearchParam';
import type { MoodleLinkVerification } from '$lib/types/moodleLinkVerification';

const COURSE_ASSISTANT_LEVEL = CourseRoleUtils.COURSE_ROLE_LEVELS.assistant;
const MOODLE_USER_ID_PATTERN = /^\d+$/;

export interface MoodleLinkVerificationContext {
	activity: {
		id: string;
		name: string;
		type: string;
		status: string;
	};
	course: {
		id: string;
		name: string;
	} | null;
	systemRoleLevel: number;
	courseRoleLevel: number | null;
}

export function canVerifyMoodleLink(context: MoodleLinkVerificationContext): boolean {
	return (
		context.systemRoleLevel >= ROLE_LEVELS.ADMIN ||
		(context.courseRoleLevel ?? 0) >= COURSE_ASSISTANT_LEVEL
	);
}

export function createMoodleLinkVerification(
	context: MoodleLinkVerificationContext,
	receivedParam: ExternalIdSearchParam | null
): MoodleLinkVerification | null {
	if (!canVerifyMoodleLink(context)) return null;

	const hasValidIdentifier = receivedParam
		? MOODLE_USER_ID_PATTERN.test(receivedParam.value)
		: false;

	return {
		kind: 'moodle-link-verification',
		activityId: context.activity.id,
		activityName: context.activity.name,
		activityType: context.activity.type,
		activityStatus: context.activity.status,
		courseId: context.course?.id ?? null,
		courseName: context.course?.name ?? null,
		parameterName: receivedParam?.name ?? null,
		parameterValue: receivedParam?.value ?? null,
		isLegacyParameter: receivedParam ? receivedParam.name !== 'id' : false,
		hasIdentifier: Boolean(receivedParam),
		hasValidIdentifier
	};
}

async function loadMoodleVerificationContext(
	activityId: string,
	user: NonNullable<App.Locals['user']>
): Promise<MoodleLinkVerificationContext | null> {
	const [row] = await db
		.select({
			activityId: schema.interactiveLearning.id,
			activityName: schema.interactiveLearning.name,
			activityType: schema.interactiveLearning.type,
			activityStatus: schema.interactiveLearning.status,
			courseId: schema.course.id,
			courseName: schema.course.name
		})
		.from(schema.interactiveLearning)
		.leftJoin(
			schema.courseInteractiveLearning,
			eq(schema.courseInteractiveLearning.interactiveLearningId, schema.interactiveLearning.id)
		)
		.leftJoin(schema.course, eq(schema.course.id, schema.courseInteractiveLearning.courseId))
		.where(eq(schema.interactiveLearning.id, activityId))
		.limit(1);

	if (!row) return null;

	const course = row.courseId && row.courseName ? { id: row.courseId, name: row.courseName } : null;
	const courseRole = course
		? await CourseRoleUtils.getUserHighestCourseRole(user.id, course.id)
		: null;

	return {
		activity: {
			id: row.activityId,
			name: row.activityName,
			type: row.activityType,
			status: row.activityStatus
		},
		course,
		systemRoleLevel: user.highestRoleLevel ?? 0,
		courseRoleLevel: courseRole?.level ?? null
	};
}

export async function resolveMoodleLinkVerification(input: {
	activityId: string;
	expectedActivityType: 'chat' | 'agent' | 'lesson';
	searchParams: URLSearchParams;
	user: App.Locals['user'];
}): Promise<MoodleLinkVerification | null> {
	if (!input.user) return null;

	const context = await loadMoodleVerificationContext(input.activityId, input.user);
	if (!context || context.activity.type !== input.expectedActivityType) return null;

	return createMoodleLinkVerification(
		context,
		resolveExternalIdSearchParamDetail(input.searchParams)
	);
}
