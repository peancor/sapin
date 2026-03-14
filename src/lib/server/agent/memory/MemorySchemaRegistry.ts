import { z } from 'zod';
import type { MemoryType } from '$lib/types/agentMemory';
import { STUDENT_ACTIVITY_MEMORY_TOOL_NAME, STUDENT_COURSE_MEMORY_TOOL_NAME } from './constants';

const MAX_DETAILS_LENGTH = 2000;
const MAX_EVIDENCE_ITEMS = 8;
const MAX_RAW_KEYS = 16;
const MAX_RAW_DEPTH = 3;
const MAX_RAW_STRING_LENGTH = 400;

type EvidenceSource = 'chat' | 'tool' | 'progress';
type EvidenceItem = {
	source: EvidenceSource;
	refId?: string;
	note?: string;
};

type WriteProposalFields = {
	summary: string;
	details: string | null;
	confidence: number | null;
	evidence: EvidenceItem[];
	mergedInput: Record<string, unknown>;
	originalInput: Record<string, unknown>;
	originalSuggestedMemoryType: string | null;
};

export type NormalizedWriteProposal =
	| {
			ok: true;
			memoryType: MemoryType;
			summary: string;
			payload: unknown;
			confidence: number | null;
			originalSuggestedMemoryType: string | null;
			inferredMemoryType: MemoryType | null;
			fallbackUsed: boolean;
			normalizationWarnings: string[];
	  }
	| {
			ok: false;
			error: string;
			originalSuggestedMemoryType: string | null;
			inferredMemoryType: MemoryType | null;
			fallbackUsed: false;
			normalizationWarnings: string[];
	  };

function wrapArrayValue(value: unknown) {
	if (Array.isArray(value)) return value;
	if (value === undefined || value === null) return value;
	return [value];
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeKey(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
}

function truncateText(value: string, max: number) {
	const trimmed = value.trim();
	return trimmed.length > max ? `${trimmed.slice(0, max - 3)}...` : trimmed;
}

function pickFirstDefined(...values: unknown[]): unknown {
	return values.find((value) => value !== undefined && value !== null);
}

function getStringCandidate(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
		if (typeof value === 'number' && Number.isFinite(value)) {
			return String(value);
		}
	}

	return null;
}

function normalizeConfidenceValue(value: unknown): number | null {
	if (typeof value !== 'number' || Number.isNaN(value)) return null;
	return Math.min(1, Math.max(0, value));
}

function sanitizeRawValue(value: unknown, depth: number = 0): unknown {
	if (depth >= MAX_RAW_DEPTH) return '[truncated]';
	if (typeof value === 'string') return truncateText(value, MAX_RAW_STRING_LENGTH);
	if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
	if (Array.isArray(value)) {
		return value.slice(0, 8).map((item) => sanitizeRawValue(item, depth + 1));
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.slice(0, MAX_RAW_KEYS)
				.map(([key, nested]) => [key, sanitizeRawValue(nested, depth + 1)])
		);
	}

	return undefined;
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

function normalizeSuggestedMemoryType(value: unknown): MemoryType | null {
	if (typeof value !== 'string' || !value.trim()) return null;

	const normalized = normalizeKey(value);
	const aliases: Record<string, MemoryType> = {
		student_preference: 'student_preference',
		preference: 'student_preference',
		learning_preference: 'student_preference',
		preference_memory: 'student_preference',
		activity_episode: 'activity_episode',
		episode: 'activity_episode',
		interaction_episode: 'activity_episode',
		session_episode: 'activity_episode',
		quiz_session: 'activity_episode',
		student_observation: 'student_observation',
		observation: 'student_observation',
		note: 'student_observation',
		student_note: 'student_observation',
		memory: 'student_observation'
	};

	return aliases[normalized] ?? null;
}

function inferEpisodeKindFromText(text: string | null) {
	if (!text) return null;
	const normalized = normalizeKey(text);

	if (/(error|wrong|mistake|confus|misunder|incorrect)/.test(normalized)) {
		return 'misconception' as const;
	}
	if (/(stuck|struggl|obstacle|blocked|friction|timeout|dropoff|difficult)/.test(normalized)) {
		return 'friction' as const;
	}
	if (/(engagement|attention|motivation|behavior|participation|habit|persist)/.test(normalized)) {
		return 'behavior' as const;
	}
	if (/(success|completed|progress|achiev|passed|solved|mastered|quiz)/.test(normalized)) {
		return 'success' as const;
	}

	return null;
}

function normalizeEvidenceItem(item: unknown): EvidenceItem | null {
	if (typeof item === 'string') {
		const note = truncateText(item, 500);
		return note ? { source: 'chat', note } : null;
	}

	const record = asRecord(item);
	if (!record) return null;

	const sourceRaw = getStringCandidate(record.source);
	const source: EvidenceSource =
		sourceRaw === 'tool' || sourceRaw === 'progress' || sourceRaw === 'chat' ? sourceRaw : 'chat';
	const refId = getStringCandidate(record.refId, record.referenceId, record.id);
	const note = getStringCandidate(
		record.note,
		record.text,
		record.summary,
		record.details,
		record.content,
		record.reason,
		record.value
	);

	if (!note && !refId) return null;

	return {
		source,
		refId: refId ? truncateText(refId, 200) : undefined,
		note: note ? truncateText(note, 500) : undefined
	};
}

function normalizeEvidenceCollection(value: unknown): EvidenceItem[] {
	const normalized = wrapArrayValue(value);
	if (!Array.isArray(normalized)) return [];

	return normalized
		.map(normalizeEvidenceItem)
		.filter((item): item is EvidenceItem => item !== null)
		.slice(0, MAX_EVIDENCE_ITEMS);
}

function buildDefaultEvidence(summary: string, details: string | null): EvidenceItem[] {
	const note = truncateText(details || summary, 500);
	return note ? [{ source: 'chat', note }] : [];
}

const evidenceSchema = z.object({
	source: z.enum(['chat', 'tool', 'progress']),
	refId: z.string().max(200).optional(),
	note: z.string().min(1).max(500).optional()
});

const genericEvidenceArraySchema = z.preprocess(
	(value) => normalizeEvidenceCollection(value),
	z.array(evidenceSchema).max(MAX_EVIDENCE_ITEMS)
);

const studentPreferenceMemorySchema = z.object({
	preferenceKind: z.preprocess(
		normalizePreferenceKind,
		z.enum(['pace', 'format', 'difficulty', 'support'])
	),
	value: z.preprocess(
		(value) => {
			if (typeof value === 'number' && Number.isFinite(value)) return String(value);
			return value;
		},
		z.string().min(1).max(200)
	),
	confidence: z.number().min(0).max(1),
	evidence: z.array(evidenceSchema).min(1).max(MAX_EVIDENCE_ITEMS)
});

const activityEpisodeMemorySchema = z.object({
	episodeKind: z.preprocess(
		normalizeEpisodeKind,
		z.enum(['success', 'misconception', 'friction', 'behavior'])
	),
	summary: z.string().min(1).max(500),
	recommendedFollowUp: z.string().max(500).optional(),
	confidence: z.number().min(0).max(1),
	evidence: z.array(evidenceSchema).min(1).max(MAX_EVIDENCE_ITEMS)
});

const studentObservationMemorySchema = z.object({
	summary: z.string().min(1).max(500),
	details: z.string().max(MAX_DETAILS_LENGTH).optional(),
	confidence: z.number().min(0).max(1).nullable().optional(),
	evidence: z.array(evidenceSchema).max(MAX_EVIDENCE_ITEMS).optional(),
	rawInput: z.record(z.string(), z.unknown()).optional(),
	inferredFrom: z.string().max(100).nullable().optional()
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
	student_observation: {
		type: 'student_observation',
		payloadSchema: studentObservationMemorySchema,
		allowedReaderTools: [STUDENT_COURSE_MEMORY_TOOL_NAME, STUDENT_ACTIVITY_MEMORY_TOOL_NAME],
		allowedWriterTools: [STUDENT_COURSE_MEMORY_TOOL_NAME, STUDENT_ACTIVITY_MEMORY_TOOL_NAME],
		defaultRetentionDays: 180
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
	private static collectWriteProposal(input: Record<string, unknown>): WriteProposalFields | null {
		const payloadRecord = asRecord(input.payload) ?? {};
		const mergedInput = { ...payloadRecord, ...input };
		delete mergedInput.payload;
		delete mergedInput.action;

		const summarySource = getStringCandidate(
			input.summary,
			payloadRecord.summary,
			payloadRecord.title,
			payloadRecord.observation,
			payloadRecord.note,
			payloadRecord.content,
			input.details,
			payloadRecord.details
		);
		if (!summarySource) return null;

		const details = getStringCandidate(
			input.details,
			payloadRecord.details,
			payloadRecord.note,
			payloadRecord.observation,
			payloadRecord.content,
			payloadRecord.reason,
			payloadRecord.description
		);
		const confidence = normalizeConfidenceValue(
			pickFirstDefined(input.confidence, payloadRecord.confidence)
		);
		const evidence = normalizeEvidenceCollection(
			pickFirstDefined(
				input.evidence,
				payloadRecord.evidence,
				payloadRecord.supportingEvidence,
				payloadRecord.examples,
				payloadRecord.references
			)
		);
		const originalSuggestedMemoryType = getStringCandidate(input.memoryType);

		return {
			summary: truncateText(summarySource, 500),
			details: details ? truncateText(details, MAX_DETAILS_LENGTH) : null,
			confidence,
			evidence,
			mergedInput,
			originalInput: input,
			originalSuggestedMemoryType
		};
	}

	private static buildStudentPreferencePayload(
		proposal: WriteProposalFields
	): { ok: true; payload: unknown } | { ok: false; warning: string } {
		const preferenceKindValue = normalizePreferenceKind(
			pickFirstDefined(
				proposal.mergedInput.preferenceKind,
				proposal.mergedInput.kind,
				proposal.mergedInput.preferenceType
			)
		);
		const value = getStringCandidate(
			proposal.mergedInput.value,
			proposal.mergedInput.preferenceValue,
			proposal.details,
			proposal.summary
		);

		if (
			preferenceKindValue !== 'pace' &&
			preferenceKindValue !== 'format' &&
			preferenceKindValue !== 'difficulty' &&
			preferenceKindValue !== 'support'
		) {
			return { ok: false, warning: 'No se pudo inferir preferenceKind canónico.' };
		}
		if (!value) {
			return { ok: false, warning: 'No se pudo inferir value para student_preference.' };
		}

		const parsed = studentPreferenceMemorySchema.safeParse({
			preferenceKind: preferenceKindValue,
			value: truncateText(value, 200),
			confidence: proposal.confidence ?? 0.5,
			evidence: proposal.evidence.length > 0 ? proposal.evidence : buildDefaultEvidence(proposal.summary, proposal.details)
		});

		return parsed.success
			? { ok: true, payload: parsed.data }
			: { ok: false, warning: parsed.error.issues.map((issue) => issue.message).join('; ') };
	}

	private static buildActivityEpisodePayload(
		proposal: WriteProposalFields
	): { ok: true; payload: unknown } | { ok: false; warning: string } {
		const combinedText = [proposal.summary, proposal.details, proposal.originalSuggestedMemoryType]
			.filter(Boolean)
			.join(' ');
		const episodeKindValue = normalizeEpisodeKind(
			pickFirstDefined(
				proposal.mergedInput.episodeKind,
				proposal.mergedInput.kind,
				proposal.mergedInput.outcome,
				inferEpisodeKindFromText(combinedText)
			)
		);
		const episodeSummary = getStringCandidate(
			proposal.mergedInput.episodeSummary,
			proposal.mergedInput.description,
			proposal.mergedInput.content,
			proposal.details,
			proposal.summary
		);
		const recommendedFollowUp = getStringCandidate(
			proposal.mergedInput.recommendedFollowUp,
			proposal.mergedInput.followUp,
			proposal.mergedInput.nextStep
		);

		if (
			episodeKindValue !== 'success' &&
			episodeKindValue !== 'misconception' &&
			episodeKindValue !== 'friction' &&
			episodeKindValue !== 'behavior'
		) {
			return { ok: false, warning: 'No se pudo inferir episodeKind canónico.' };
		}
		if (!episodeSummary) {
			return { ok: false, warning: 'No se pudo inferir summary para activity_episode.' };
		}

		const parsed = activityEpisodeMemorySchema.safeParse({
			episodeKind: episodeKindValue,
			summary: truncateText(episodeSummary, 500),
			recommendedFollowUp: recommendedFollowUp ? truncateText(recommendedFollowUp, 500) : undefined,
			confidence: proposal.confidence ?? 0.5,
			evidence: proposal.evidence.length > 0 ? proposal.evidence : buildDefaultEvidence(proposal.summary, proposal.details)
		});

		return parsed.success
			? { ok: true, payload: parsed.data }
			: { ok: false, warning: parsed.error.issues.map((issue) => issue.message).join('; ') };
	}

	static inferMemoryType(input: Record<string, unknown>): MemoryType | null {
		const payloadRecord = asRecord(input.payload) ?? {};
		const suggested = normalizeSuggestedMemoryType(input.memoryType);
		if (suggested && suggested !== 'student_observation') {
			return suggested;
		}

		const preferenceKind = normalizePreferenceKind(
			pickFirstDefined(payloadRecord.preferenceKind, payloadRecord.kind, input['preferenceKind'])
		);
		if (
			preferenceKind === 'pace' ||
			preferenceKind === 'format' ||
			preferenceKind === 'difficulty' ||
			preferenceKind === 'support'
		) {
			return 'student_preference';
		}

		const episodeKind = normalizeEpisodeKind(
			pickFirstDefined(payloadRecord.episodeKind, payloadRecord.kind, input['episodeKind'])
		);
		if (
			episodeKind === 'success' ||
			episodeKind === 'misconception' ||
			episodeKind === 'friction' ||
			episodeKind === 'behavior'
		) {
			return 'activity_episode';
		}

		const combinedText = [
			getStringCandidate(input.memoryType),
			getStringCandidate(input.summary),
			getStringCandidate(input.details),
			getStringCandidate(payloadRecord.summary),
			getStringCandidate(payloadRecord.details),
			getStringCandidate(payloadRecord.note)
		]
			.filter(Boolean)
			.join(' ')
			.toLowerCase();

		if (/(prefer|pace|format|style|difficulty|support|hint|guidance)/.test(combinedText)) {
			return 'student_preference';
		}
		if (/(quiz|session|success|misconception|confusion|error|wrong|stuck|friction|behavior|engagement)/.test(combinedText)) {
			return 'activity_episode';
		}

		return null;
	}

	static buildFallbackObservationPayload(input: {
		summary: string;
		details?: string | null;
		confidence?: number | null;
		evidence?: unknown;
		rawInput?: Record<string, unknown>;
		inferredFrom?: string | null;
	}) {
		const parsed = studentObservationMemorySchema.safeParse({
			summary: truncateText(input.summary, 500),
			details: input.details ? truncateText(input.details, MAX_DETAILS_LENGTH) : undefined,
			confidence: normalizeConfidenceValue(input.confidence ?? null),
			evidence: normalizeEvidenceCollection(input.evidence),
			rawInput: input.rawInput ? (sanitizeRawValue(input.rawInput) as Record<string, unknown>) : undefined,
			inferredFrom: input.inferredFrom ? truncateText(input.inferredFrom, 100) : null
		});

		if (!parsed.success) {
			return {
				ok: false as const,
				error: parsed.error.issues.map((issue) => issue.message).join('; ')
			};
		}

		return {
			ok: true as const,
			payload: parsed.data
		};
	}

	static normalizeWriteProposal(input: Record<string, unknown>): NormalizedWriteProposal {
		const proposal = this.collectWriteProposal(input);
		const originalSuggestedMemoryType = getStringCandidate(input.memoryType);
		const normalizationWarnings: string[] = [];

		if (!proposal) {
			return {
				ok: false,
				error: 'La memoria requiere al menos un summary o contenido textual util.',
				originalSuggestedMemoryType,
				inferredMemoryType: null,
				fallbackUsed: false,
				normalizationWarnings
			};
		}

		const suggestedType = normalizeSuggestedMemoryType(proposal.originalSuggestedMemoryType);
		const inferredType = this.inferMemoryType(input);
		const candidateTypes = [suggestedType, inferredType].filter(
			(type): type is MemoryType => !!type && type !== 'student_observation'
		);

		for (const candidateType of candidateTypes) {
			const builtPayload =
				candidateType === 'student_preference'
					? this.buildStudentPreferencePayload(proposal)
					: this.buildActivityEpisodePayload(proposal);

			if (builtPayload.ok) {
				return {
					ok: true,
					memoryType: candidateType,
					summary: proposal.summary,
					payload: builtPayload.payload,
					confidence: proposal.confidence,
					originalSuggestedMemoryType: proposal.originalSuggestedMemoryType,
					inferredMemoryType: candidateType,
					fallbackUsed: false,
					normalizationWarnings
				};
			}

			normalizationWarnings.push(builtPayload.warning);
		}

		const fallback = this.buildFallbackObservationPayload({
			summary: proposal.summary,
			details: proposal.details,
			confidence: proposal.confidence,
			evidence: proposal.evidence,
			rawInput: proposal.originalInput,
			inferredFrom: (suggestedType ?? inferredType ?? proposal.originalSuggestedMemoryType) || null
		});

		if (!fallback.ok) {
			return {
				ok: false,
				error: fallback.error,
				originalSuggestedMemoryType: proposal.originalSuggestedMemoryType,
				inferredMemoryType: inferredType,
				fallbackUsed: false,
				normalizationWarnings
			};
		}

		if (candidateTypes.length > 0) {
			normalizationWarnings.push('Se guardo como student_observation al no encajar limpiamente en un tipo canónico.');
		}

		return {
			ok: true,
			memoryType: 'student_observation',
			summary: proposal.summary,
			payload: fallback.payload,
			confidence: proposal.confidence,
			originalSuggestedMemoryType: proposal.originalSuggestedMemoryType,
			inferredMemoryType: inferredType,
			fallbackUsed: true,
			normalizationWarnings
		};
	}

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
				memoryType === 'course_staff_note' ||
				memoryType === 'student_observation') &&
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
