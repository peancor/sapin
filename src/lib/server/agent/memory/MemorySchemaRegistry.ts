import { z } from 'zod';
import type { MemoryType } from '$lib/types/agentMemory';
import { STUDENT_ACTIVITY_MEMORY_TOOL_NAME, STUDENT_COURSE_MEMORY_TOOL_NAME } from './constants';

function wrapArrayValue(value: unknown) {
	if (Array.isArray(value)) return value;
	if (value === undefined || value === null) return value;
	return [value];
}

function normalizeKey(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
}

function normalizePreferenceKind(value: unknown) {
	if (typeof value !== 'string') return value;

	const normalized = normalizeKey(value);
	const aliases: Record<string, 'pace' | 'format' | 'difficulty' | 'support'> = {
		pace: 'pace',
		pacing: 'pace',
		speed: 'pace',
		tempo: 'pace',
		study_pace: 'pace',
		learning_pace: 'pace',
		format: 'format',
		modality: 'format',
		style: 'format',
		presentation: 'format',
		content_format: 'format',
		explanation_format: 'format',
		difficulty: 'difficulty',
		difficulty_level: 'difficulty',
		challenge: 'difficulty',
		complexity: 'difficulty',
		level: 'difficulty',
		support: 'support',
		help: 'support',
		hint: 'support',
		scaffolding: 'support',
		guidance: 'support'
	};

	return aliases[normalized] ?? value;
}

function normalizeEpisodeKind(value: unknown) {
	if (typeof value !== 'string') return value;

	const normalized = normalizeKey(value);
	const aliases: Record<string, 'success' | 'misconception' | 'friction' | 'behavior'> = {
		success: 'success',
		achievement: 'success',
		progress: 'success',
		completion: 'success',
		completed: 'success',
		passed: 'success',
		correct: 'success',
		solved: 'success',
		mastered: 'success',
		quiz_session: 'success',
		quiz_completed: 'success',
		practice_success: 'success',
		misconception: 'misconception',
		misunderstanding: 'misconception',
		confusion: 'misconception',
		confused: 'misconception',
		mistake: 'misconception',
		error: 'misconception',
		incorrect: 'misconception',
		wrong_answer: 'misconception',
		wrong: 'misconception',
		friction: 'friction',
		struggle: 'friction',
		obstacle: 'friction',
		blocked: 'friction',
		stuck: 'friction',
		hesitation: 'friction',
		timeout: 'friction',
		dropoff: 'friction',
		difficulty: 'friction',
		behavior: 'behavior',
		engagement: 'behavior',
		attention: 'behavior',
		motivation: 'behavior',
		participation: 'behavior',
		persistence: 'behavior',
		habit: 'behavior'
	};

	return aliases[normalized] ?? value;
}

const evidenceSchema = z.object({
	source: z.enum(['chat', 'tool', 'progress']),
	refId: z.string().optional(),
	note: z.string().min(1).max(500).optional()
});

const studentEvidenceSchema = evidenceSchema.extend({
	source: z.enum(['chat', 'tool'])
});

const studentEvidenceArraySchema = z.preprocess((value) => {
	const normalized = wrapArrayValue(value);
	if (!Array.isArray(normalized)) return normalized;

	return normalized.map((item) => {
		if (typeof item === 'string') {
			return { source: 'chat', note: item };
		}

		return item;
	});
}, z.array(studentEvidenceSchema).min(1));

const genericEvidenceArraySchema = z.preprocess((value) => {
	const normalized = wrapArrayValue(value);
	if (!Array.isArray(normalized)) return normalized;

	return normalized.map((item) => {
		if (typeof item === 'string') {
			return { source: 'chat', note: item };
		}

		return item;
	});
}, z.array(evidenceSchema).min(1));

const studentPreferenceMemorySchema = z.object({
	preferenceKind: z.preprocess(
		normalizePreferenceKind,
		z.enum(['pace', 'format', 'difficulty', 'support'])
	),
	value: z.string().min(1).max(200),
	confidence: z.number().min(0).max(1),
	evidence: studentEvidenceArraySchema
});

const activityEpisodeMemorySchema = z.object({
	episodeKind: z.preprocess(
		normalizeEpisodeKind,
		z.enum(['success', 'misconception', 'friction', 'behavior'])
	),
	summary: z.string().min(1).max(500),
	recommendedFollowUp: z.string().max(500).optional(),
	confidence: z.number().min(0).max(1),
	evidence: genericEvidenceArraySchema
});

const courseStaffNoteMemorySchema = z.object({
	noteType: z.enum(['intervention', 'accommodation', 'risk', 'achievement']),
	summary: z.string().min(1).max(500),
	confidence: z.number().min(0).max(1)
});

export interface MemorySchemaDefinition {
	type: MemoryType;
	payloadSchema: z.ZodTypeAny;
	allowedReaderTools: string[];
	allowedWriterTools: string[];
	defaultRetentionDays?: number;
	minConfidenceToStore?: number;
}

const MEMORY_DEFINITIONS: Record<MemoryType, MemorySchemaDefinition> = {
	student_preference: {
		type: 'student_preference',
		payloadSchema: studentPreferenceMemorySchema,
		allowedReaderTools: [STUDENT_COURSE_MEMORY_TOOL_NAME, STUDENT_ACTIVITY_MEMORY_TOOL_NAME],
		allowedWriterTools: [STUDENT_COURSE_MEMORY_TOOL_NAME, STUDENT_ACTIVITY_MEMORY_TOOL_NAME],
		defaultRetentionDays: 365,
		minConfidenceToStore: 0.4
	},
	activity_episode: {
		type: 'activity_episode',
		payloadSchema: activityEpisodeMemorySchema,
		allowedReaderTools: [STUDENT_COURSE_MEMORY_TOOL_NAME, STUDENT_ACTIVITY_MEMORY_TOOL_NAME],
		allowedWriterTools: [STUDENT_COURSE_MEMORY_TOOL_NAME, STUDENT_ACTIVITY_MEMORY_TOOL_NAME],
		defaultRetentionDays: 180,
		minConfidenceToStore: 0.4
	},
	course_staff_note: {
		type: 'course_staff_note',
		payloadSchema: courseStaffNoteMemorySchema,
		allowedReaderTools: [],
		allowedWriterTools: [],
		defaultRetentionDays: 365,
		minConfidenceToStore: 0.5
	}
};

export class MemorySchemaRegistry {
	static getDefinition(memoryType: string): MemorySchemaDefinition | null {
		return MEMORY_DEFINITIONS[memoryType as MemoryType] ?? null;
	}

	static getReadableMemoryTypes(toolName: string): MemoryType[] {
		return (Object.values(MEMORY_DEFINITIONS) as MemorySchemaDefinition[])
			.filter((definition) => definition.allowedReaderTools.includes(toolName))
			.map((definition) => definition.type);
	}

	static getWritableMemoryTypes(toolName: string): MemoryType[] {
		return (Object.values(MEMORY_DEFINITIONS) as MemorySchemaDefinition[])
			.filter((definition) => definition.allowedWriterTools.includes(toolName))
			.map((definition) => definition.type);
	}

	static parsePayload(memoryType: string, payload: unknown) {
		const definition = this.getDefinition(memoryType);
		if (!definition) {
			return { ok: false as const, error: `Tipo de memoria no soportado: ${memoryType}` };
		}

		const parsed = definition.payloadSchema.safeParse(payload);
		if (!parsed.success) {
			return {
				ok: false as const,
				error: parsed.error.issues.map((issue) => issue.message).join('; ')
			};
		}

		return { ok: true as const, definition, payload: parsed.data };
	}

	static extractConfidence(memoryType: string, payload: unknown): number | null {
		if (!payload || typeof payload !== 'object') return null;
		if (
			(memoryType === 'student_preference' ||
				memoryType === 'activity_episode' ||
				memoryType === 'course_staff_note') &&
			'confidence' in payload &&
			typeof payload.confidence === 'number'
		) {
			return payload.confidence;
		}

		return null;
	}

	static computeExpiry(memoryType: string, fromDate: Date): Date | null {
		const definition = this.getDefinition(memoryType);
		if (!definition?.defaultRetentionDays) return null;

		return new Date(fromDate.getTime() + definition.defaultRetentionDays * 24 * 60 * 60 * 1000);
	}
}
