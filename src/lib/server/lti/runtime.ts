import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { markActivityInProgress } from '$lib/server/db/ProgressWriteUtils';
import { LessonService } from '$lib/server/lesson/LessonService';

export async function getActivityForLti(courseId: string, activityId: string) {
	const [activity] = await db
		.select({
			activity: table.interactiveLearning,
			courseInteractive: table.courseInteractiveLearning
		})
		.from(table.courseInteractiveLearning)
		.innerJoin(
			table.interactiveLearning,
			eq(table.courseInteractiveLearning.interactiveLearningId, table.interactiveLearning.id)
		)
		.where(
			and(
				eq(table.courseInteractiveLearning.interactiveLearningId, activityId),
				eq(table.courseInteractiveLearning.courseId, courseId)
			)
		)
		.limit(1);

	if (!activity || activity.courseInteractive.courseId !== courseId) {
		throw new Error('La actividad LTI no pertenece al curso Sapin indicado.');
	}

	return activity.activity;
}

export async function startLtiActivity(input: {
	userId: string;
	courseId: string;
	activityId: string;
	activityType: string;
}) {
	if (input.activityType === 'lesson') {
		const session = await LessonService.startOrResumeSession({
			interactiveLearningId: input.activityId,
			userId: input.userId,
			userRoleLevel: 10,
			courseId: input.courseId
		});
		return `/course/${input.courseId}/run/lesson/${session.id}`;
	}

	if (input.activityType === 'chat' || input.activityType === 'agent') {
		const now = new Date();
		const chatId = nanoid();

		await db.insert(table.chat).values({
			id: chatId,
			userId: input.userId,
			title: 'LTI launch',
			metadata: JSON.stringify({
				source: 'lti',
				courseId: input.courseId,
				activityId: input.activityId
			}),
			createdAt: now,
			updatedAt: now
		});

		await db.insert(table.userInteractiveLearningChat).values({
			id: nanoid(),
			userId: input.userId,
			interactiveLearningChatId: input.activityId,
			chatId,
			createdAt: now
		});

		await markActivityInProgress({
			userId: input.userId,
			courseId: input.courseId,
			activityId: input.activityId,
			activityType: input.activityType,
			source: 'lti'
		});

		if (input.activityType === 'agent') {
			return `/agent-chat/${input.activityId}/c/${chatId}`;
		}

		return `/course/${input.courseId}/run/chat/${chatId}`;
	}

	return `/course/${input.courseId}`;
}
