import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db, CourseRoleUtils } from '$lib/server/db';
import { 
    user, 
    interactiveLearning, 
    courseInteractiveLearning, 
    userInteractiveLearningChat,
    courseProgressSummary,
    learningActivityProgress,
    learningProgressEvent
} from '$lib/server/db/schema';
import { calculateCourseProgressSummary } from '$lib/server/db/ProgressUtils';
import { eq, and, gte, desc } from 'drizzle-orm';

export const load = (async ({ params }) => {
    const { cid, sid } = params;
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 29);

    // Get student details
    const students = await db
        .select({
            id: user.id,
            username: user.username,
            alias: user.alias,
            email: user.email,
            image: user.image,
            externalId: user.externalId
        })
        .from(user)
        .where(eq(user.id, sid))
        .all();

    const studentDetails = students[0];
    if (!studentDetails) {
        throw error(404, 'Student not found');
    }

    // Verificar que el estudiante tiene rol en el curso
    const studentCourseRole = await CourseRoleUtils.getUserHighestCourseRole(sid, cid);

    if (!studentCourseRole) {
        throw error(404, 'Student not enrolled in this course');
    }

    // Get course activities
    const activities = await db
        .select({
            id: interactiveLearning.id,
            name: interactiveLearning.name,
            description: interactiveLearning.description,
            type: interactiveLearning.type,
            content: interactiveLearning.content,
            order: courseInteractiveLearning.order,
            createdAt: interactiveLearning.createdAt
        })
        .from(courseInteractiveLearning)
        .innerJoin(
            interactiveLearning,
            eq(courseInteractiveLearning.interactiveLearningId, interactiveLearning.id)
        )
        .where(eq(courseInteractiveLearning.courseId, cid))
        .orderBy(courseInteractiveLearning.order)
        .all();

    // Get student's progress data
    const studentChats = await db
        .select({
            activityId: userInteractiveLearningChat.interactiveLearningChatId,
            lastAccessed: userInteractiveLearningChat.createdAt,
            chatId: userInteractiveLearningChat.chatId
        })
        .from(userInteractiveLearningChat)
        .innerJoin(
            courseInteractiveLearning,
            eq(courseInteractiveLearning.interactiveLearningId, userInteractiveLearningChat.interactiveLearningChatId)
        )
        .where(
            and(
                eq(userInteractiveLearningChat.userId, sid),
                eq(courseInteractiveLearning.courseId, cid)
            )
        )
        .all();

    // Get student's overall progress
    const progressRecords = await db
        .select()
        .from(courseProgressSummary)
        .where(and(
            eq(courseProgressSummary.courseId, cid),
            eq(courseProgressSummary.userId, sid)
        ))
        .all();

    const progress = progressRecords[0];

    // Get detailed activity progress
    const activitiesProgress = await db
        .select()
        .from(learningActivityProgress)
        .where(and(
            eq(learningActivityProgress.courseId, cid),
            eq(learningActivityProgress.userId, sid)
        ))
        .all();

    const courseActivityIds = new Set(activities.map((activity) => activity.id));

    const courseActivityProgress = activitiesProgress.filter((record) =>
        courseActivityIds.has(record.activityId)
    );

    const progressSummary = calculateCourseProgressSummary(courseActivityProgress, activities.length, {
        context: `admin/student-detail:course:${cid}:student:${sid}`
    });

    const recentEvents = await db
        .select({
            activityId: learningProgressEvent.activityId,
            eventType: learningProgressEvent.eventType,
            eventAt: learningProgressEvent.eventAt
        })
        .from(learningProgressEvent)
        .where(
            and(
                eq(learningProgressEvent.courseId, cid),
                eq(learningProgressEvent.userId, sid),
                gte(learningProgressEvent.eventAt, thirtyDaysAgo)
            )
        )
        .orderBy(desc(learningProgressEvent.eventAt))
        .all();

    const lastActivityFromChats =
        studentChats.length > 0
            ? studentChats.reduce((latest, current) =>
                    current.lastAccessed > latest.lastAccessed ? current : latest
                )
            : null;

    return {
        student: studentDetails,
        activities,
        progress: studentChats,
        stats: {
            completedActivities: progressSummary.completedActivities,
            totalActivities: progressSummary.totalActivities,
            completionRate: progressSummary.completionRate,
            lastActivityDate:
                progressSummary.lastActivityAt ??
                lastActivityFromChats?.lastAccessed ??
                progress?.lastActivityAt ??
                null,
            totalTimeSpent: progressSummary.totalTimeSpent || progress?.totalTimeSpentSeconds || 0,
            activitiesDetail: courseActivityProgress
        },
        recentEvents
    };
}) satisfies PageServerLoad;