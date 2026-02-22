import type { LearningActivityProgress } from './schema';

export interface CourseProgressSummary {
    completedActivities: number;
    totalActivities: number;
    completionRate: number;
    totalTimeSpent: number;
    lastActivityAt: Date | null;
}

interface CourseProgressSummaryOptions {
    context?: string;
}

function estimateRecordTimeSpentSeconds(record: LearningActivityProgress): number {
    if (record.timeSpentSeconds > 0) {
        return record.timeSpentSeconds;
    }

    if (!record.startedAt) {
        return 0;
    }

    const endAt = record.completedAt ?? record.lastInteractionAt;
    if (!endAt) {
        return 0;
    }

    return Math.max(0, Math.floor((endAt.getTime() - record.startedAt.getTime()) / 1000));
}

export function calculateCourseProgressSummary(
    activityRecords: LearningActivityProgress[],
    totalActivities: number,
    options?: CourseProgressSummaryOptions
): CourseProgressSummary {
    const completedActivities = activityRecords.filter((record) => record.status === 'completed').length;
    const totalTimeSpent = activityRecords.reduce(
        (sum, record) => sum + estimateRecordTimeSpentSeconds(record),
        0
    );

    const lastActivityAt =
        activityRecords.length > 0
            ? activityRecords.reduce((latest, current) =>
                    current.lastInteractionAt > latest.lastInteractionAt ? current : latest
                ).lastInteractionAt
            : null;

    const rawCompletionRate =
        totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0;

    if (totalActivities > 0 && completedActivities > totalActivities) {
        console.warn('[Progress] Inconsistent completion counts detected', {
            context: options?.context,
            completedActivities,
            totalActivities,
            rawCompletionRate
        });
    }

    return {
        completedActivities,
        totalActivities,
        completionRate: Math.min(100, rawCompletionRate),
        totalTimeSpent,
        lastActivityAt
    };
}