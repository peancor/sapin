import { and, eq, gte } from 'drizzle-orm';
import { db } from './index';
import {
    courseInteractiveLearning,
    interactiveLearning,
    courseRole,
    courseRoleType,
    user,
    learningActivityProgress,
    learningProgressEvent
} from './schema';

interface ActivityAnalytics {
    activityId: string;
    name: string;
    type: string;
    status: string;
    attemptedStudents: number;
    completedStudents: number;
    inProgressStudents: number;
    notStartedStudents: number;
    completionRate: number;
}

interface StudentAnalytics {
    userId: string;
    displayName: string | null;
    alias: string | null;
    username: string | null;
    email: string | null;
    completionRate: number;
    completedActivities: number;
    totalTimeSpentSeconds: number;
    inProgressActivities: number;
    lastActivityAt: Date | null;
}

interface LastActivitySummary {
    activityId: string;
    activityName: string;
    activityType: string;
    userId: string;
    studentLabel: string;
    eventType: string;
    eventAt: Date;
}

interface RecentActivityItem {
    activityId: string;
    activityName: string;
    activityType: string;
    userId: string;
    studentLabel: string;
    eventType: string;
    eventAt: Date;
    eventCount: number;
    activityCount: number;
}

interface RecentActivityStats {
    events24h: number;
    completed24h: number;
    activeStudents24h: number;
}

interface TrendPoint {
    date: string;
    total: number;
    completed: number;
    started: number;
}

interface CalendarHeatmapPoint {
    date: string;
    value: number;
}

interface StudentActivityHeatmap {
    students: {
        userId: string;
        label: string;
        displayName: string | null;
        alias: string | null;
        username: string | null;
        email: string | null;
        completionRate: number;
        completedActivities: number;
        inProgressActivities: number;
        totalTimeSpentSeconds: number;
        lastActivityAt: Date | null;
    }[];
    dates: string[];
    values: [number, number, number][];
    maxValue: number;
}

interface PunchCardHeatmap {
    weekdays: string[];
    hours: string[];
    values: [number, number, number][];
    maxValue: number;
}

interface StackedTrendPoint {
    date: string;
    started: number;
    completed: number;
    other: number;
    total: number;
}

export interface CourseLearningAnalytics {
    totalStudents: number;
    totalActivities: number;
    participants: number;
    activeStudents7d: number;
    participationRate: number;
    overallCompletionRate: number;
    avgCompletionRateByStudent: number;
    totalCompletedPairs: number;
    totalInProgressPairs: number;
    totalNotStartedPairs: number;
    totalTimeSpentSeconds: number;
    avgTimeSpentPerParticipantSeconds: number;
    lastActivityAt: Date | null;
    lastActivitySummary: LastActivitySummary | null;
    recentActivities: RecentActivityItem[];
    recentActivityStats: RecentActivityStats;
    activityAnalytics: ActivityAnalytics[];
    topStudents: StudentAnalytics[];
    trend14d: TrendPoint[];
    calendarHeatmap180d: CalendarHeatmapPoint[];
    studentActivityHeatmap28d: StudentActivityHeatmap;
    punchCardHeatmap60d: PunchCardHeatmap;
    stackedTrend30d: StackedTrendPoint[];
}

function toDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeEventType(eventType: string): string {
    return eventType.trim().toLowerCase();
}

function getStudentDisplayLabel(student: {
    userId: string;
    displayName: string | null;
    alias: string | null;
    username: string | null;
    email: string | null;
}): string {
    return (
        student.displayName?.trim() ||
        student.alias?.trim() ||
        student.username?.trim() ||
        student.email?.trim() ||
        student.userId.slice(0, 8)
    );
}

export async function getCourseLearningAnalytics(courseId: string): Promise<CourseLearningAnalytics> {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentFeedCoalesceWindowMs = 20 * 60 * 1000;
    const calendarDays = 180;
    const studentHeatmapDays = 28;
    const stackedTrendDays = 30;
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(now.getDate() - 59);

    const calendarStart = new Date(now);
    calendarStart.setDate(now.getDate() - (calendarDays - 1));

    const activities = await db
        .select({
            activityId: interactiveLearning.id,
            name: interactiveLearning.name,
            type: interactiveLearning.type,
            status: interactiveLearning.status
        })
        .from(courseInteractiveLearning)
        .innerJoin(
            interactiveLearning,
            eq(courseInteractiveLearning.interactiveLearningId, interactiveLearning.id)
        )
        .where(eq(courseInteractiveLearning.courseId, courseId));

    const students = await db
        .select({
            userId: courseRole.userId,
            displayName: user.displayName,
            alias: user.alias,
            username: user.username,
            email: user.email
        })
        .from(courseRole)
        .innerJoin(user, eq(courseRole.userId, user.id))
        .where(
            and(
                eq(courseRole.courseId, courseId),
                eq(courseRole.role, courseRoleType.STUDENT),
                eq(courseRole.isActive, true)
            )
        );

    const studentById = new Map(students.map((student) => [student.userId, student]));
    const studentIds = [...new Set(students.map((student) => student.userId))];
    const studentIdSet = new Set(studentIds);

    const [progressRowsRaw, trendEventsRaw] = await Promise.all([
        db
            .select()
            .from(learningActivityProgress)
            .where(eq(learningActivityProgress.courseId, courseId)),
        db
            .select({
                eventAt: learningProgressEvent.eventAt,
                eventType: learningProgressEvent.eventType,
                activityId: learningProgressEvent.activityId,
                userId: learningProgressEvent.userId
            })
            .from(learningProgressEvent)
            .where(
                and(
                    eq(learningProgressEvent.courseId, courseId),
                    gte(learningProgressEvent.eventAt, calendarStart)
                )
            )
    ]);

    const progressRows = progressRowsRaw.filter((row) => studentIdSet.has(row.userId));
    const trendEvents = trendEventsRaw
        .filter((row) => studentIdSet.has(row.userId))
        .map((row) => ({
            ...row,
            eventType: normalizeEventType(row.eventType)
        }));

    const totalStudents = studentIds.length;
    const totalActivities = activities.length;

    const participantSet = new Set(progressRows.map((row) => row.userId));
    const activeStudents7dSet = new Set(
        progressRows
            .filter((row) => row.lastInteractionAt && row.lastInteractionAt >= sevenDaysAgo)
            .map((row) => row.userId)
    );

    const totalCompletedPairs = progressRows.filter((row) => row.status === 'completed').length;
    const totalInProgressPairs = progressRows.filter((row) => row.status === 'in_progress').length;
    const totalPossiblePairs = totalStudents * totalActivities;
    const totalNotStartedPairs = Math.max(0, totalPossiblePairs - totalCompletedPairs - totalInProgressPairs);

    const totalTimeSpentSeconds = progressRows.reduce(
        (acc, row) => acc + row.timeSpentSeconds,
        0
    );

    const participants = participantSet.size;
    const participationRate = totalStudents > 0 ? clampPercent((participants / totalStudents) * 100) : 0;
    const overallCompletionRate =
        totalPossiblePairs > 0 ? clampPercent((totalCompletedPairs / totalPossiblePairs) * 100) : 0;

    const progressRowsByUser = new Map<string, typeof progressRows>();
    for (const row of progressRows) {
        const currentRows = progressRowsByUser.get(row.userId);
        if (!currentRows) {
            progressRowsByUser.set(row.userId, [row]);
            continue;
        }
        currentRows.push(row);
    }

    const rankedStudents: StudentAnalytics[] = studentIds
        .map((userId) => {
            const profile = studentById.get(userId);
            const userRows = progressRowsByUser.get(userId) ?? [];
            const completedActivities = userRows.filter((row) => row.status === 'completed').length;
            const inProgressActivities = userRows.filter((row) => row.status === 'in_progress').length;
            const totalTimeSpentSeconds = userRows.reduce(
                (total, row) => total + row.timeSpentSeconds,
                0
            );
            const lastActivityAt =
                userRows.length > 0
                    ? userRows.reduce((latest, row) => {
                            if (!latest || row.lastInteractionAt > latest) {
                                return row.lastInteractionAt;
                            }
                            return latest;
                        }, null as Date | null)
                    : null;

            const completionRate =
                totalActivities > 0 ? clampPercent((completedActivities / totalActivities) * 100) : 0;

            return {
                userId,
                displayName: profile?.displayName ?? null,
                alias: profile?.alias ?? null,
                username: profile?.username ?? null,
                email: profile?.email ?? null,
                completionRate,
                completedActivities,
                totalTimeSpentSeconds,
                inProgressActivities,
                lastActivityAt
            };
        })
        .sort((a, b) => {
            if (b.completionRate !== a.completionRate) return b.completionRate - a.completionRate;
            if (b.completedActivities !== a.completedActivities)
                return b.completedActivities - a.completedActivities;
            return b.totalTimeSpentSeconds - a.totalTimeSpentSeconds;
        });

    const avgCompletionRateByStudent =
        rankedStudents.length > 0
            ? clampPercent(
                    rankedStudents.reduce((acc, student) => acc + student.completionRate, 0) /
                        rankedStudents.length
                )
            : 0;

    const avgTimeSpentPerParticipantSeconds =
        participants > 0 ? Math.round(totalTimeSpentSeconds / participants) : 0;

    const lastActivityAt =
        progressRows.length > 0
            ? progressRows.reduce((latest, current) => {
                    if (!latest || current.lastInteractionAt > latest) {
                        return current.lastInteractionAt;
                    }
                    return latest;
                }, null as Date | null)
            : null;

    const activityById = new Map(
        activities.map((activity) => [activity.activityId, activity])
    );

    const lastActivitySummary = trendEvents.reduce((latest, eventRow) => {
        if (!latest || eventRow.eventAt > latest.eventAt) {
            const activity = activityById.get(eventRow.activityId);
            const student = studentById.get(eventRow.userId);
            return {
                activityId: eventRow.activityId,
                activityName: activity?.name ?? 'Actividad eliminada',
                activityType: activity?.type ?? 'desconocido',
                userId: eventRow.userId,
                studentLabel: getStudentDisplayLabel({
                    userId: eventRow.userId,
                    displayName: student?.displayName ?? null,
                    alias: student?.alias ?? null,
                    username: student?.username ?? null,
                    email: student?.email ?? null
                }),
                eventType: eventRow.eventType,
                eventAt: eventRow.eventAt
            };
        }

        return latest;
    }, null as LastActivitySummary | null);

    const recentActivitiesRaw = trendEvents
        .slice()
        .sort((a, b) => b.eventAt.getTime() - a.eventAt.getTime())
        .map((eventRow) => {
            const activity = activityById.get(eventRow.activityId);
            const student = studentById.get(eventRow.userId);

            return {
                activityId: eventRow.activityId,
                activityName: activity?.name ?? 'Actividad eliminada',
                activityType: activity?.type ?? 'desconocido',
                userId: eventRow.userId,
                studentLabel: getStudentDisplayLabel({
                    userId: eventRow.userId,
                    displayName: student?.displayName ?? null,
                    alias: student?.alias ?? null,
                    username: student?.username ?? null,
                    email: student?.email ?? null
                }),
                eventType: eventRow.eventType,
                eventAt: eventRow.eventAt,
                eventCount: 1,
                activityCount: 1
            };
        });

    const recentActivitiesCoalesced: RecentActivityItem[] = [];
    const recentActivityGroupNames = new Map<number, Set<string>>();

    for (const event of recentActivitiesRaw) {
        const lastGroupIndex = recentActivitiesCoalesced.length - 1;
        const lastGroup = recentActivitiesCoalesced[lastGroupIndex];

        const shouldCoalesce =
            !!lastGroup &&
            lastGroup.userId === event.userId &&
            lastGroup.activityId === event.activityId &&
            lastGroup.eventAt.getTime() - event.eventAt.getTime() <= recentFeedCoalesceWindowMs;

        if (!shouldCoalesce) {
            recentActivitiesCoalesced.push(event);
            recentActivityGroupNames.set(lastGroupIndex + 1, new Set([event.activityName]));
            continue;
        }

        const groupNameSet = recentActivityGroupNames.get(lastGroupIndex) ?? new Set<string>();
        groupNameSet.add(event.activityName);
        recentActivityGroupNames.set(lastGroupIndex, groupNameSet);

        const currentGroup = recentActivitiesCoalesced[lastGroupIndex];
        currentGroup.eventCount += 1;
        currentGroup.activityCount = groupNameSet.size;

        if (currentGroup.activityName !== event.activityName && currentGroup.activityCount > 1) {
            currentGroup.activityName = `${currentGroup.activityName} +${currentGroup.activityCount - 1} más`;
        }

        if (event.eventType === 'completed') {
            currentGroup.eventType = 'completed';
        } else if (event.eventType === 'started' && currentGroup.eventType !== 'completed') {
            currentGroup.eventType = 'started';
        }
    }

    const recentActivities: RecentActivityItem[] = recentActivitiesCoalesced.slice(0, 8);

    const events24h = trendEvents.filter((eventRow) => eventRow.eventAt >= twentyFourHoursAgo);
    const recentActivityStats: RecentActivityStats = {
        events24h: events24h.length,
        completed24h: events24h.filter((eventRow) => eventRow.eventType === 'completed').length,
        activeStudents24h: new Set(events24h.map((eventRow) => eventRow.userId)).size
    };

    const activityAttemptedUsersMap = new Map<string, Set<string>>();
    const activityCompletedUsersMap = new Map<string, Set<string>>();

    for (const row of progressRows) {
        if (!activityAttemptedUsersMap.has(row.activityId)) {
            activityAttemptedUsersMap.set(row.activityId, new Set());
        }
        activityAttemptedUsersMap.get(row.activityId)!.add(row.userId);

        if (row.status === 'completed') {
            if (!activityCompletedUsersMap.has(row.activityId)) {
                activityCompletedUsersMap.set(row.activityId, new Set());
            }
            activityCompletedUsersMap.get(row.activityId)!.add(row.userId);
        }
    }

    const activityAnalytics: ActivityAnalytics[] = activities.map((activity) => {
        const attemptedStudents = activityAttemptedUsersMap.get(activity.activityId)?.size ?? 0;
        const completedStudents = activityCompletedUsersMap.get(activity.activityId)?.size ?? 0;
        const inProgressStudents = Math.max(0, attemptedStudents - completedStudents);
        const notStartedStudents = Math.max(0, totalStudents - attemptedStudents);
        const completionRate =
            totalStudents > 0 ? clampPercent((completedStudents / totalStudents) * 100) : 0;

        return {
            activityId: activity.activityId,
            name: activity.name,
            type: activity.type,
            status: activity.status,
            attemptedStudents,
            completedStudents,
            inProgressStudents,
            notStartedStudents,
            completionRate
        };
    });

    const topStudents: StudentAnalytics[] = rankedStudents.slice(0, 10);

    const trendMap = new Map<string, TrendPoint>();
    for (let offset = 13; offset >= 0; offset -= 1) {
        const day = new Date(now);
        day.setDate(now.getDate() - offset);
        const key = toDateKey(day);
        trendMap.set(key, { date: key, total: 0, completed: 0, started: 0 });
    }

    const calendarMap = new Map<string, number>();
    for (let offset = calendarDays - 1; offset >= 0; offset -= 1) {
        const day = new Date(now);
        day.setDate(now.getDate() - offset);
        calendarMap.set(toDateKey(day), 0);
    }

    const stackedMap = new Map<string, StackedTrendPoint>();
    for (let offset = stackedTrendDays - 1; offset >= 0; offset -= 1) {
        const day = new Date(now);
        day.setDate(now.getDate() - offset);
        const key = toDateKey(day);
        stackedMap.set(key, {
            date: key,
            started: 0,
            completed: 0,
            other: 0,
            total: 0
        });
    }

    for (const eventRow of trendEvents) {
        const key = toDateKey(eventRow.eventAt);
        if (calendarMap.has(key)) {
            calendarMap.set(key, (calendarMap.get(key) ?? 0) + 1);
        }

        const entry = trendMap.get(key);
        if (!entry) continue;

        entry.total += 1;
        if (eventRow.eventType === 'completed') {
            entry.completed += 1;
        }
        if (eventRow.eventType === 'started') {
            entry.started += 1;
        }

        const stackedEntry = stackedMap.get(key);
        if (stackedEntry) {
            stackedEntry.total += 1;
            if (eventRow.eventType === 'started') {
                stackedEntry.started += 1;
            } else if (eventRow.eventType === 'completed') {
                stackedEntry.completed += 1;
            } else {
                stackedEntry.other += 1;
            }
        }
    }

    const trend14d = [...trendMap.values()];

    const calendarHeatmap180d: CalendarHeatmapPoint[] = [...calendarMap.entries()].map(
        ([date, value]) => ({ date, value })
    );

    const stackedTrend30d = [...stackedMap.values()];

    const studentHeatmapDates = Array.from({ length: studentHeatmapDays }, (_, index) => {
        const day = new Date(now);
        day.setDate(now.getDate() - (studentHeatmapDays - 1 - index));
        return toDateKey(day);
    });

    const studentHeatmapDateIndex = new Map(
        studentHeatmapDates.map((date, index) => [date, index])
    );

    const heatmapStudentRows = rankedStudents.map((student) => ({
        userId: student.userId,
        label: getStudentDisplayLabel(student),
        displayName: student.displayName,
        alias: student.alias,
        username: student.username,
        email: student.email,
        completionRate: student.completionRate,
        completedActivities: student.completedActivities,
        inProgressActivities: student.inProgressActivities,
        totalTimeSpentSeconds: student.totalTimeSpentSeconds,
        lastActivityAt: student.lastActivityAt
    }));

    const heatmapStudentIndex = new Map(
        heatmapStudentRows.map((student, index) => [student.userId, index])
    );

    const studentHeatmapCounts = new Map<string, number>();
    for (const eventRow of trendEvents) {
        const studentIndex = heatmapStudentIndex.get(eventRow.userId);
        if (studentIndex === undefined) continue;

        const dateIndex = studentHeatmapDateIndex.get(toDateKey(eventRow.eventAt));
        if (dateIndex === undefined) continue;

        const key = `${dateIndex}-${studentIndex}`;
        studentHeatmapCounts.set(key, (studentHeatmapCounts.get(key) ?? 0) + 1);
    }

    const studentActivityHeatmapValues: [number, number, number][] = [];
    let studentActivityHeatmapMaxValue = 0;

    for (let studentIndex = 0; studentIndex < heatmapStudentRows.length; studentIndex += 1) {
        for (let dateIndex = 0; dateIndex < studentHeatmapDates.length; dateIndex += 1) {
            const value = studentHeatmapCounts.get(`${dateIndex}-${studentIndex}`) ?? 0;
            studentActivityHeatmapValues.push([dateIndex, studentIndex, value]);
            if (value > studentActivityHeatmapMaxValue) {
                studentActivityHeatmapMaxValue = value;
            }
        }
    }

    const studentActivityHeatmap28d: StudentActivityHeatmap = {
        students: heatmapStudentRows,
        dates: studentHeatmapDates,
        values: studentActivityHeatmapValues,
        maxValue: studentActivityHeatmapMaxValue
    };

    const punchCardWeekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const punchCardHours = Array.from({ length: 24 }, (_, hour) => hour.toString().padStart(2, '0'));
    const punchCardCounter = new Map<string, number>();

    for (const eventRow of trendEvents) {
        if (eventRow.eventAt < sixtyDaysAgo) continue;

        const jsDay = eventRow.eventAt.getDay();
        const mondayFirstDay = (jsDay + 6) % 7;
        const hour = eventRow.eventAt.getHours();
        const key = `${hour}-${mondayFirstDay}`;
        punchCardCounter.set(key, (punchCardCounter.get(key) ?? 0) + 1);
    }

    const punchCardValues: [number, number, number][] = [];
    let punchCardMaxValue = 0;
    for (let day = 0; day < 7; day += 1) {
        for (let hour = 0; hour < 24; hour += 1) {
            const value = punchCardCounter.get(`${hour}-${day}`) ?? 0;
            punchCardValues.push([hour, day, value]);
            if (value > punchCardMaxValue) {
                punchCardMaxValue = value;
            }
        }
    }

    const punchCardHeatmap60d: PunchCardHeatmap = {
        weekdays: punchCardWeekdays,
        hours: punchCardHours,
        values: punchCardValues,
        maxValue: punchCardMaxValue
    };

    return {
        totalStudents,
        totalActivities,
        participants,
        activeStudents7d: activeStudents7dSet.size,
        participationRate,
        overallCompletionRate,
        avgCompletionRateByStudent,
        totalCompletedPairs,
        totalInProgressPairs,
        totalNotStartedPairs,
        totalTimeSpentSeconds,
        avgTimeSpentPerParticipantSeconds,
        lastActivityAt,
        lastActivitySummary,
        recentActivities,
        recentActivityStats,
        activityAnalytics,
        topStudents,
        trend14d,
        calendarHeatmap180d,
        studentActivityHeatmap28d,
        punchCardHeatmap60d,
        stackedTrend30d
    };
}