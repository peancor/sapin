import { z } from 'zod';

export const activityProgressEventType = {
    STARTED: 'started',
    INTERACTION: 'interaction',
    COMPLETED: 'completed',
    UPDATED: 'updated'
} as const;

export const learningProgressEventPayloadSchema = z.object({
    version: z.literal(1).default(1),
    source: z.string().optional(),
    status: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    custom: z.record(z.string(), z.unknown()).optional()
});

const activityProgressEventSchema = z.object({
    type: z.enum([
        activityProgressEventType.STARTED,
        activityProgressEventType.INTERACTION,
        activityProgressEventType.COMPLETED,
        activityProgressEventType.UPDATED
    ]),
    at: z.string(),
    source: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional()
});

export const activityProgressMetadataSchema = z.object({
    version: z.literal(1).default(1),
    activityType: z.string().optional(),
    source: z.string().optional(),
    lastEvent: activityProgressEventSchema.optional(),
    custom: z.record(z.string(), z.unknown()).optional()
});

export const activityProgressMetadataPatchSchema = z.object({
    activityType: z.string().optional(),
    source: z.string().optional(),
    custom: z.record(z.string(), z.unknown()).optional()
});

export const courseProgressSummaryMetadataSchema = z.object({
    version: z.literal(1).default(1),
    source: z.string().optional(),
    totalActivities: z.number().int().nonnegative().optional(),
    completedFromStatusCount: z.number().int().nonnegative().optional(),
    inProgressFromStatusCount: z.number().int().nonnegative().optional(),
    custom: z.record(z.string(), z.unknown()).optional()
});

export const courseProgressSummaryMetadataPatchSchema = z.object({
    source: z.string().optional(),
    totalActivities: z.number().int().nonnegative().optional(),
    completedFromStatusCount: z.number().int().nonnegative().optional(),
    inProgressFromStatusCount: z.number().int().nonnegative().optional(),
    custom: z.record(z.string(), z.unknown()).optional()
});

export type ActivityProgressMetadata = z.infer<typeof activityProgressMetadataSchema>;
export type ActivityProgressMetadataPatch = z.infer<typeof activityProgressMetadataPatchSchema>;
export type LearningProgressEventPayload = z.infer<typeof learningProgressEventPayloadSchema>;
export type CourseProgressSummaryMetadata = z.infer<typeof courseProgressSummaryMetadataSchema>;
export type CourseProgressSummaryMetadataPatch = z.infer<
    typeof courseProgressSummaryMetadataPatchSchema
>;

function parseMetadataString(raw: string | null | undefined): ActivityProgressMetadata {
    if (!raw) {
        return { version: 1 };
    }

    try {
        const parsed = JSON.parse(raw);
        const validated = activityProgressMetadataSchema.safeParse(parsed);
        if (validated.success) {
            return validated.data;
        }
    } catch {
        // Ignore malformed legacy metadata
    }

    return { version: 1 };
}

function parseSummaryMetadataString(
    raw: string | null | undefined
): CourseProgressSummaryMetadata {
    if (!raw) {
        return { version: 1 };
    }

    try {
        const parsed = JSON.parse(raw);
        const validated = courseProgressSummaryMetadataSchema.safeParse(parsed);
        if (validated.success) {
            return validated.data;
        }
    } catch {
        // Ignore malformed metadata
    }

    return { version: 1 };
}

export function mergeActivityProgressMetadata(options: {
    existingMetadata: string | null | undefined;
    patch?: ActivityProgressMetadataPatch;
    eventType: keyof typeof activityProgressEventType;
    source?: string;
    details?: Record<string, unknown>;
}): string {
    const current = parseMetadataString(options.existingMetadata);

    const next: ActivityProgressMetadata = {
        ...current,
        ...(options.patch ?? {}),
        version: 1,
        lastEvent: {
            type: activityProgressEventType[options.eventType],
            at: new Date().toISOString(),
            source: options.source ?? options.patch?.source ?? current.source,
            details: options.details
        }
    };

    return JSON.stringify(next);
}

export function buildLearningProgressEventPayload(options: {
    source?: string;
    status?: string;
    details?: Record<string, unknown>;
    custom?: Record<string, unknown>;
}): string {
    const payload = learningProgressEventPayloadSchema.parse({
        version: 1,
        source: options.source,
        status: options.status,
        details: options.details,
        custom: options.custom
    });

    return JSON.stringify(payload);
}

export function mergeCourseProgressSummaryMetadata(options: {
    existingMetadata: string | null | undefined;
    patch?: CourseProgressSummaryMetadataPatch;
    source?: string;
    totalActivities?: number;
    completedFromStatusCount?: number;
    inProgressFromStatusCount?: number;
}): string {
    const current = parseSummaryMetadataString(options.existingMetadata);

    const next = courseProgressSummaryMetadataSchema.parse({
        ...current,
        ...(options.patch ?? {}),
        version: 1,
        source: options.source ?? options.patch?.source ?? current.source,
        totalActivities: options.totalActivities ?? options.patch?.totalActivities ?? current.totalActivities,
        completedFromStatusCount:
            options.completedFromStatusCount ??
            options.patch?.completedFromStatusCount ??
            current.completedFromStatusCount,
        inProgressFromStatusCount:
            options.inProgressFromStatusCount ??
            options.patch?.inProgressFromStatusCount ??
            current.inProgressFromStatusCount
    });

    return JSON.stringify(next);
}
