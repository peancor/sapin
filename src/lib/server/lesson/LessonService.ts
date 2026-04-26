import type { ModelMessage } from 'ai';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { db, CourseInteractiveAuthUtils, InteractiveChatAuthUtils } from '$lib/server/db';
import { DBAgentMessageUtils } from '$lib/server/db/agent';
import { markActivityCompleted, markActivityInProgress } from '$lib/server/db/ProgressWriteUtils';
import {
	agentMessage,
	chat,
	courseInteractiveLearning,
	interactiveLearning,
	interactiveLearningFile,
	interactiveLearningLesson,
	interactiveLessonBlockState,
	interactiveLessonBlockVisit,
	interactiveLessonEvent,
	interactiveLessonSession,
	lessonDefinitionBindingStatus,
	lessonAttemptStatus,
	lessonBlockStateStatus,
	lessonBlockVisitStatus,
	lessonEventType,
	lessonSessionScope,
	message
} from '$lib/server/db/schema';
import type {
	InteractiveLearning,
	InteractiveLearningFile,
	InteractiveLearningLesson,
	InteractiveLearningLessonRevision,
	InteractiveLessonBlockState,
	InteractiveLessonBlockVisit,
	InteractiveLessonSession
} from '$lib/server/db/schema';
import type {
	LessonAgentBlock,
	LessonAvailableVariable,
	LessonBlock,
	LessonBlockContract,
	LessonBlockContractField,
	LessonBlockGraphSummary,
	LessonBlockReferenceGroups,
	LessonCheckBlock,
	LessonCheckMode,
	LessonCheckTextMatchMode,
	LessonBlockKind,
	LessonConditionOperator,
	LessonDefinition,
	LessonOutputField,
	LessonTransition
} from '$lib/types/lesson';
import {
	isLessonAgentInteractive,
	normalizeLessonAgentConfig,
	normalizeLessonCheckConfig
} from '$lib/types/lesson';
import type { AgentContext, AgentDisplayMessage } from '$lib/types/agent';
import { AgentEngine } from '$lib/server/agent/AgentEngine';
import { AgentTranscriptService } from '$lib/server/agent/AgentTranscriptService';
import { deriveEnabledUIComponentKeysFromTools } from '$lib/utils/agentToolUiMapping';
import type { LessonSessionRevisionInfo } from '$lib/types/lessonRevision';
import { and, desc, eq, inArray, isNotNull, max, ne } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { LessonServiceError } from './LessonServiceError';
import { LessonRevisionService } from './LessonRevisionService';
import { resolveLessonAgentTools } from './lessonAgentTools';
import {
	buildLessonBlockContract,
	getAvailableLessonReferenceGroups,
	getAvailableLessonVariables,
	getLessonBlock,
	getLessonBlockGraphSummary,
	getLessonGraphSummaries,
	parseLessonDefinition,
	validateLessonDefinition
} from './lessonGraph';
import { validateLessonAuthoringDraft } from './lessonFlowDraft';

export { LessonServiceError } from './LessonServiceError';

type JsonRecord = Record<string, unknown>;

const lessonTransitionSchema = z.object({
	id: z.string().optional(),
	label: z.string().optional(),
	targetBlockId: z.string().min(1),
	condition: z
		.object({
			source: z.string().min(1),
			operator: z.enum([
				'equals',
				'not_equals',
				'contains',
				'exists',
				'not_exists',
				'gt',
				'gte',
				'lt',
				'lte'
			]),
			value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()
		})
		.optional()
});

const DEFAULT_LESSON_DEFINITION: LessonDefinition = {
	version: '2',
	entryBlockId: 'intro',
	blocks: [
		{
			id: 'intro',
			kind: 'content',
			title: 'Introducción',
			body: 'Bienvenido a tu nueva lección viva.\n\nPresenta aquí el contexto, objetivos y materiales iniciales.',
			continueLabel: 'Empezar',
			next: 'finish'
		},
		{
			id: 'finish',
			kind: 'end',
			title: 'Cierre',
			body: 'Has llegado al final de esta lección.',
			ctaLabel: 'Volver al curso'
		}
	]
};

export interface LessonResolvedAsset {
	fileId: string;
	caption?: string;
	kind: 'image' | 'video' | 'audio' | 'file';
	url: string;
	name: string;
	mimeType: string;
}

export interface LessonSessionView {
	activity: InteractiveLearning;
	lesson: InteractiveLearningLesson;
	revision: InteractiveLearningLessonRevision;
	definition: LessonDefinition;
	session: InteractiveLessonSession;
	sessionRevisionInfo: LessonSessionRevisionInfo;
	blockStates: InteractiveLessonBlockState[];
	blockVisits: InteractiveLessonBlockVisit[];
	currentBlock: LessonBlock;
	resolvedCurrentBlock: LessonBlock;
	currentBlockState: InteractiveLessonBlockState | null;
	currentVisit: InteractiveLessonBlockVisit | null;
	currentAssets: LessonResolvedAsset[];
	currentChatMessages: Array<{ id: string; type: string; content: string; createdAt: Date }>;
	currentAgentMessages: AgentDisplayMessage[];
	files: InteractiveLearningFile[];
	filesById: Record<string, InteractiveLearningFile>;
	availableVariables: LessonAvailableVariable[];
	availableReferenceGroups: LessonReferenceGroups;
	currentBlockContract: LessonBlockContract;
	currentVisitId: string | null;
	canRestart: boolean;
	canInteract: boolean;
	isReadOnly: boolean;
}

interface LessonReferenceGroups {
	session: LessonAvailableVariable[];
	state: LessonAvailableVariable[];
	outputs: LessonAvailableVariable[];
	byBlock: LessonBlockReferenceGroups[];
}

interface LessonTemplateContext {
	session: JsonRecord;
	blocks: Record<string, { state: JsonRecord; outputs: JsonRecord }>;
}

type LessonAgentStreamResult = Awaited<ReturnType<typeof AIUtils.streamTextFromMessages>>;

interface PreparedLessonAgentExecution {
	view: LessonSessionView & {
		currentBlock: LessonAgentBlock;
		resolvedCurrentBlock: LessonAgentBlock;
	};
	blockVisit: InteractiveLessonBlockVisit;
	modelName: string;
	currentOutputs: JsonRecord;
	generationMessages: ModelMessage[];
	outputMessagesBase: ModelMessage[];
	userMessage: string;
	autoStarted: boolean;
}

interface AgentConversationStats {
	userTurns: number;
	assistantTurns: number;
	uiResponseCount: number;
	userInteractionCount: number;
}

type LessonAgentAutoStartStatus = 'idle' | 'pending' | 'streaming' | 'completed' | 'failed';
type LessonAgentExtractionStatus = 'not_configured' | 'ok' | 'failed' | 'missing_field' | 'coerced';

interface LessonAgentOutputExtractionAudit {
	status: LessonAgentExtractionStatus;
	message: string;
	missingFields: string[];
	coercedFields: string[];
	failedFields: string[];
}

interface LessonAgentOutputValueResult {
	value: unknown;
	coerced: boolean;
	valid: boolean;
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
	if (!value) return fallback;

	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

function normalizeOutputs(value: string | null | undefined): JsonRecord {
	return safeJsonParse<JsonRecord>(value, {});
}

function extractTemplateRefs(input: string | null | undefined): string[] {
	if (!input) return [];
	return Array.from(input.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g), (match) => match[1]?.trim()).filter(
		Boolean
	) as string[];
}

function toModelRole(type: string): 'system' | 'user' | 'assistant' {
	if (type === 'SYSTEM') return 'system';
	if (type === 'ASSISTANT') return 'assistant';
	return 'user';
}

function coerceOutputValueWithAudit(
	raw: unknown,
	field: LessonOutputField
): LessonAgentOutputValueResult {
	if (raw === undefined || raw === null) {
		return { value: null, coerced: false, valid: false };
	}

	if (field.type === 'number') {
		if (typeof raw === 'number') {
			return { value: raw, coerced: false, valid: Number.isFinite(raw) };
		}
		const value = Number(raw);
		return { value, coerced: true, valid: Number.isFinite(value) };
	}

	if (field.type === 'boolean') {
		if (typeof raw === 'boolean') return { value: raw, coerced: false, valid: true };
		const normalized = String(raw).trim().toLowerCase();
		if (normalized === 'true') return { value: true, coerced: true, valid: true };
		if (normalized === 'false') return { value: false, coerced: true, valid: true };
		return { value: null, coerced: true, valid: false };
	}

	if (field.type === 'string') {
		return {
			value: typeof raw === 'string' ? raw : String(raw),
			coerced: typeof raw !== 'string',
			valid: true
		};
	}

	return { value: raw, coerced: false, valid: true };
}

interface LessonCheckSubmissionResult {
	outputs: JsonRecord;
	metadata: JsonRecord;
	completed: boolean;
}

function normalizeCheckTextValue(
	value: string,
	options: { trimWhitespace: boolean; caseSensitive: boolean }
): string {
	const trimmed = options.trimWhitespace ? value.trim() : value;
	return options.caseSensitive ? trimmed : trimmed.toLowerCase();
}

function scoreCheckOptionSelection(
	selectedOptionIds: string[],
	correctOptionIds: string[],
	mode: Extract<LessonCheckMode, 'single_choice' | 'multiple_choice' | 'true_false'>
): number {
	const selected = new Set(selectedOptionIds);
	const correct = new Set(correctOptionIds);
	if (mode !== 'multiple_choice') {
		return selectedOptionIds.length === 1 && correct.has(selectedOptionIds[0]!) ? 1 : 0;
	}

	const intersection = [...selected].filter((optionId) => correct.has(optionId)).length;
	const wrongSelections = [...selected].filter((optionId) => !correct.has(optionId)).length;
	const denominator = Math.max(correct.size, 1);
	return Math.max(0, (intersection - wrongSelections) / denominator);
}

function matchShortTextAnswer(
	candidate: string,
	acceptedAnswer: string,
	mode: LessonCheckTextMatchMode
): boolean {
	if (mode === 'contains') {
		return candidate.includes(acceptedAnswer);
	}
	if (mode === 'regex') {
		try {
			return new RegExp(acceptedAnswer).test(candidate);
		} catch {
			return false;
		}
	}
	return candidate === acceptedAnswer;
}

function shouldTrackLessonProgress(scope: InteractiveLessonSession['scope']): boolean {
	return scope === lessonSessionScope.LEARNER;
}

export class LessonService {
	static createDefaultDefinition(): LessonDefinition {
		return structuredClone(DEFAULT_LESSON_DEFINITION);
	}

	static serializeDefinition(definition: LessonDefinition): string {
		return JSON.stringify(definition, null, 2);
	}

	static parseDefinition(content: string): LessonDefinition {
		return parseLessonDefinition(content);
	}

	static validateDefinition(definition: LessonDefinition): LessonDefinition {
		return validateLessonDefinition(definition);
	}

	static validateAuthoringDraft(definition: LessonDefinition): LessonDefinition {
		return validateLessonAuthoringDraft(definition);
	}

	static getBlock(definition: LessonDefinition, blockId: string): LessonBlock {
		return getLessonBlock(definition, blockId);
	}

	static createBlock(
		definition: LessonDefinition,
		kind: LessonBlockKind
	): { definition: LessonDefinition; block: LessonBlock } {
		const nextDefinition = structuredClone(definition);
		const block = this.createBlockTemplate(nextDefinition, kind);
		nextDefinition.blocks.push(block);

		if (!nextDefinition.entryBlockId) {
			nextDefinition.entryBlockId = block.id;
		}

		return {
			definition: this.validateDefinition(nextDefinition),
			block: structuredClone(block)
		};
	}

	static createBlockDraft(
		definition: LessonDefinition,
		kind: LessonBlockKind
	): { definition: LessonDefinition; block: LessonBlock } {
		const nextDefinition = structuredClone(definition);
		const block = this.createBlockTemplate(nextDefinition, kind);
		nextDefinition.blocks.push(block);

		if (!nextDefinition.entryBlockId) {
			nextDefinition.entryBlockId = block.id;
		}

		return {
			definition: this.validateAuthoringDraft(nextDefinition),
			block: structuredClone(block)
		};
	}

	static updateBlock(
		definition: LessonDefinition,
		blockId: string,
		block: LessonBlock
	): LessonDefinition {
		const nextDefinition = structuredClone(definition);
		const blockIndex = nextDefinition.blocks.findIndex((candidate) => candidate.id === blockId);

		if (blockIndex < 0) {
			throw new LessonServiceError(404, `El bloque "${blockId}" no existe.`);
		}

		nextDefinition.blocks[blockIndex] = structuredClone(block);

		if (definition.entryBlockId === blockId && block.id !== blockId) {
			nextDefinition.entryBlockId = block.id;
		}

		return this.validateDefinition(nextDefinition);
	}

	static updateBlockDraft(
		definition: LessonDefinition,
		blockId: string,
		block: LessonBlock
	): LessonDefinition {
		const nextDefinition = structuredClone(definition);
		const blockIndex = nextDefinition.blocks.findIndex((candidate) => candidate.id === blockId);

		if (blockIndex < 0) {
			throw new LessonServiceError(404, `El bloque "${blockId}" no existe.`);
		}

		nextDefinition.blocks[blockIndex] = structuredClone(block);

		if (definition.entryBlockId === blockId && block.id !== blockId) {
			nextDefinition.entryBlockId = block.id;
		}

		if (block.id !== blockId) {
			this.replaceBlockReferences(nextDefinition, blockId, block.id);
		}

		return this.validateAuthoringDraft(nextDefinition);
	}

	static deleteBlock(definition: LessonDefinition, blockId: string): LessonDefinition {
		if (definition.blocks.length <= 1) {
			throw new LessonServiceError(
				400,
				'La lesson debe conservar al menos un bloque. Crea otro antes de eliminar este.'
			);
		}

		const references = this.findIncomingReferences(definition, blockId);
		if (references.length > 0) {
			throw new LessonServiceError(
				400,
				`No se puede eliminar el bloque "${blockId}" porque aún recibe referencias desde ${references.join(', ')}.`
			);
		}

		const nextDefinition = structuredClone(definition);
		nextDefinition.blocks = nextDefinition.blocks.filter((block) => block.id !== blockId);

		if (nextDefinition.entryBlockId === blockId) {
			nextDefinition.entryBlockId = nextDefinition.blocks[0]?.id ?? '';
		}

		return this.validateDefinition(nextDefinition);
	}

	static deleteBlockDraft(definition: LessonDefinition, blockId: string): LessonDefinition {
		if (definition.blocks.length <= 1) {
			throw new LessonServiceError(
				400,
				'La lesson debe conservar al menos un bloque. Crea otro antes de eliminar este.'
			);
		}

		if (!definition.blocks.some((block) => block.id === blockId)) {
			throw new LessonServiceError(404, `El bloque "${blockId}" no existe.`);
		}

		const nextDefinition = structuredClone(definition);
		nextDefinition.blocks = nextDefinition.blocks.filter((block) => block.id !== blockId);

		if (nextDefinition.entryBlockId === blockId) {
			nextDefinition.entryBlockId = nextDefinition.blocks[0]?.id ?? '';
		}

		this.removeBlockReferences(nextDefinition, blockId);
		return this.validateAuthoringDraft(nextDefinition);
	}

	static moveBlock(
		definition: LessonDefinition,
		blockId: string,
		direction: 'up' | 'down'
	): LessonDefinition {
		const nextDefinition = structuredClone(definition);
		const currentIndex = nextDefinition.blocks.findIndex((block) => block.id === blockId);

		if (currentIndex < 0) {
			throw new LessonServiceError(404, `El bloque "${blockId}" no existe.`);
		}

		const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
		if (targetIndex < 0 || targetIndex >= nextDefinition.blocks.length) {
			return this.validateDefinition(nextDefinition);
		}

		const [block] = nextDefinition.blocks.splice(currentIndex, 1);
		nextDefinition.blocks.splice(targetIndex, 0, block);
		return this.validateDefinition(nextDefinition);
	}

	static moveBlockDraft(
		definition: LessonDefinition,
		blockId: string,
		direction: 'up' | 'down'
	): LessonDefinition {
		const nextDefinition = structuredClone(definition);
		const currentIndex = nextDefinition.blocks.findIndex((block) => block.id === blockId);

		if (currentIndex < 0) {
			throw new LessonServiceError(404, `El bloque "${blockId}" no existe.`);
		}

		const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
		if (targetIndex < 0 || targetIndex >= nextDefinition.blocks.length) {
			return this.validateAuthoringDraft(nextDefinition);
		}

		const [block] = nextDefinition.blocks.splice(currentIndex, 1);
		if (block) {
			nextDefinition.blocks.splice(targetIndex, 0, block);
		}

		return this.validateAuthoringDraft(nextDefinition);
	}

	static setEntryBlock(definition: LessonDefinition, blockId: string): LessonDefinition {
		if (!definition.blocks.some((block) => block.id === blockId)) {
			throw new LessonServiceError(404, `El bloque "${blockId}" no existe.`);
		}

		return this.validateDefinition({
			...structuredClone(definition),
			entryBlockId: blockId
		});
	}

	static setEntryBlockDraft(definition: LessonDefinition, blockId: string): LessonDefinition {
		if (!definition.blocks.some((block) => block.id === blockId)) {
			throw new LessonServiceError(404, `El bloque "${blockId}" no existe.`);
		}

		return this.validateAuthoringDraft({
			...structuredClone(definition),
			entryBlockId: blockId
		});
	}

	static getAvailableReferenceGroups(definition: LessonDefinition): LessonReferenceGroups {
		return getAvailableLessonReferenceGroups(definition);
	}

	static getAvailableVariables(definition: LessonDefinition): LessonAvailableVariable[] {
		return getAvailableLessonVariables(definition);
	}

	static getGraphSummaries(definition: LessonDefinition): LessonBlockGraphSummary[] {
		return getLessonGraphSummaries(definition);
	}

	static getBlockGraphSummary(
		definition: LessonDefinition,
		blockId: string
	): LessonBlockGraphSummary {
		return getLessonBlockGraphSummary(definition, blockId);
	}

	static async startOrResumeSession(input: {
		interactiveLearningId: string;
		userId: string;
		userRoleLevel: number;
		courseId?: string | null;
	}): Promise<InteractiveLessonSession> {
		const access = await InteractiveChatAuthUtils.userCanAccessInteractiveActivity(
			input.userId,
			input.interactiveLearningId,
			input.userRoleLevel
		);

		if (!access.allowed) {
			throw new LessonServiceError(403, access.reason || 'No tienes acceso a esta lesson.');
		}

		const revisionState = await LessonRevisionService.ensureLessonRevisionState(
			input.interactiveLearningId,
			{
				actorUserId: input.userId
			}
		);
		const activityData = {
			activity: revisionState.activity,
			lesson: revisionState.lesson
		};
		const courseId = await this.resolveCourseId(
			input.interactiveLearningId,
			input.courseId ?? access.courseId
		);
		const canBypassStatus = access.isSystemAdmin || this.isStaff(access.courseRole);
		const latestSession = await db
			.select()
			.from(interactiveLessonSession)
			.where(
				and(
					eq(interactiveLessonSession.interactiveLearningId, input.interactiveLearningId),
					eq(interactiveLessonSession.userId, input.userId),
					eq(interactiveLessonSession.courseId, courseId),
					eq(interactiveLessonSession.scope, lessonSessionScope.LEARNER),
					isNotNull(interactiveLessonSession.definitionRevisionId)
				)
			)
			.orderBy(
				desc(interactiveLessonSession.attemptNumber),
				desc(interactiveLessonSession.createdAt)
			)
			.get();

		if (!canBypassStatus) {
			if (
				activityData.activity.status === 'hidden' ||
				activityData.activity.status === 'archived'
			) {
				throw new LessonServiceError(404, 'La lesson no está disponible.');
			}

			if (activityData.activity.status === 'closed') {
				if (latestSession) return latestSession;
				throw new LessonServiceError(403, 'La lesson está cerrada y no admite nuevos intentos.');
			}
		}

		if (activityData.lesson.sessionPolicy === 'resume_latest' && latestSession) {
			return latestSession;
		}

		if (activityData.activity.status === 'closed' && !canBypassStatus) {
			if (latestSession) return latestSession;
			throw new LessonServiceError(403, 'La lesson está cerrada y no admite nuevos intentos.');
		}

		return this.createSession({
			interactiveLearningId: input.interactiveLearningId,
			userId: input.userId,
			courseId,
			scope: lessonSessionScope.LEARNER,
			bindingStatus: lessonDefinitionBindingStatus.EXACT,
			revision: revisionState.publishedRevision,
			entryBlockId: revisionState.publishedDefinition.entryBlockId
		});
	}

	static async startPreviewSession(input: {
		interactiveLearningId: string;
		userId: string;
		userRoleLevel: number;
		previewMode: 'published' | 'draft';
		courseId?: string | null;
	}): Promise<InteractiveLessonSession> {
		const access = await InteractiveChatAuthUtils.userCanAccessInteractiveActivity(
			input.userId,
			input.interactiveLearningId,
			input.userRoleLevel
		);

		if (!access.allowed) {
			throw new LessonServiceError(403, access.reason || 'No tienes acceso a esta lesson.');
		}

		const revisionState = await LessonRevisionService.ensureLessonRevisionState(
			input.interactiveLearningId,
			{
				actorUserId: input.userId
			}
		);
		const courseId = await this.resolveCourseId(
			input.interactiveLearningId,
			input.courseId ?? access.courseId
		);
		const scope =
			input.previewMode === 'draft'
				? lessonSessionScope.PREVIEW_DRAFT
				: lessonSessionScope.PREVIEW_PUBLISHED;
		const targetRevision =
			scope === lessonSessionScope.PREVIEW_DRAFT
				? revisionState.draftRevision
				: revisionState.publishedRevision;
		const targetDefinition =
			scope === lessonSessionScope.PREVIEW_DRAFT
				? revisionState.draftDefinition
				: revisionState.publishedDefinition;
		const shouldAlwaysStartFreshPreview = scope === lessonSessionScope.PREVIEW_DRAFT;

		if (shouldAlwaysStartFreshPreview) {
			await this.purgePreviewSessions({
				interactiveLearningId: input.interactiveLearningId,
				userId: input.userId,
				courseId,
				scope
			});

			return this.createSession({
				interactiveLearningId: input.interactiveLearningId,
				userId: input.userId,
				courseId,
				scope,
				bindingStatus: lessonDefinitionBindingStatus.EXACT,
				revision: targetRevision,
				entryBlockId: targetDefinition.entryBlockId
			});
		}

		const latestSession = await db
			.select()
			.from(interactiveLessonSession)
			.where(
				and(
					eq(interactiveLessonSession.interactiveLearningId, input.interactiveLearningId),
					eq(interactiveLessonSession.userId, input.userId),
					eq(interactiveLessonSession.courseId, courseId),
					eq(interactiveLessonSession.scope, scope),
					isNotNull(interactiveLessonSession.definitionRevisionId)
				)
			)
			.orderBy(
				desc(interactiveLessonSession.attemptNumber),
				desc(interactiveLessonSession.createdAt)
			)
			.get();

		if (
			latestSession &&
			latestSession.definitionRevisionId === targetRevision.id &&
			latestSession.status !== lessonAttemptStatus.RESTARTED
		) {
			return latestSession;
		}

		await db
			.update(interactiveLessonSession)
			.set({
				status: lessonAttemptStatus.ABANDONED,
				currentVisitId: null,
				lastActiveAt: new Date(),
				updatedAt: new Date()
			})
			.where(
				and(
					eq(interactiveLessonSession.interactiveLearningId, input.interactiveLearningId),
					eq(interactiveLessonSession.userId, input.userId),
					eq(interactiveLessonSession.courseId, courseId),
					eq(interactiveLessonSession.scope, scope),
					ne(interactiveLessonSession.status, lessonAttemptStatus.COMPLETED)
				)
			);

		return this.createSession({
			interactiveLearningId: input.interactiveLearningId,
			userId: input.userId,
			courseId,
			scope,
			bindingStatus: lessonDefinitionBindingStatus.EXACT,
			revision: targetRevision,
			entryBlockId: targetDefinition.entryBlockId
		});
	}

	static async selectOrCreatePreviewSession(input: {
		interactiveLearningId: string;
		userId: string;
		userRoleLevel: number;
		previewMode: 'published' | 'draft';
		courseId?: string | null;
		sessionId?: string | null;
		forceNew?: boolean;
	}): Promise<InteractiveLessonSession> {
		const access = await InteractiveChatAuthUtils.userCanAccessInteractiveActivity(
			input.userId,
			input.interactiveLearningId,
			input.userRoleLevel
		);

		if (!access.allowed) {
			throw new LessonServiceError(403, access.reason || 'No tienes acceso a esta lesson.');
		}

		const revisionState = await LessonRevisionService.ensureLessonRevisionState(
			input.interactiveLearningId,
			{
				actorUserId: input.userId
			}
		);
		const courseId = await this.resolveCourseId(
			input.interactiveLearningId,
			input.courseId ?? access.courseId
		);
		const scope =
			input.previewMode === 'draft'
				? lessonSessionScope.PREVIEW_DRAFT
				: lessonSessionScope.PREVIEW_PUBLISHED;
		const targetRevision =
			scope === lessonSessionScope.PREVIEW_DRAFT
				? revisionState.draftRevision
				: revisionState.publishedRevision;
		const targetDefinition =
			scope === lessonSessionScope.PREVIEW_DRAFT
				? revisionState.draftDefinition
				: revisionState.publishedDefinition;

		if (input.sessionId && !input.forceNew) {
			const requestedSession = await db
				.select()
				.from(interactiveLessonSession)
				.where(eq(interactiveLessonSession.id, input.sessionId))
				.get();

			if (
				requestedSession &&
				requestedSession.interactiveLearningId === input.interactiveLearningId &&
				requestedSession.userId === input.userId &&
				requestedSession.courseId === courseId &&
				requestedSession.scope === scope &&
				requestedSession.definitionRevisionId === targetRevision.id &&
				requestedSession.status !== lessonAttemptStatus.RESTARTED &&
				requestedSession.status !== lessonAttemptStatus.ABANDONED
			) {
				return requestedSession;
			}
		}

		if (!input.forceNew) {
			const latestSession = await db
				.select()
				.from(interactiveLessonSession)
				.where(
					and(
						eq(interactiveLessonSession.interactiveLearningId, input.interactiveLearningId),
						eq(interactiveLessonSession.userId, input.userId),
						eq(interactiveLessonSession.courseId, courseId),
						eq(interactiveLessonSession.scope, scope),
						eq(interactiveLessonSession.definitionRevisionId, targetRevision.id)
					)
				)
				.orderBy(
					desc(interactiveLessonSession.attemptNumber),
					desc(interactiveLessonSession.createdAt)
				)
				.get();

			if (
				latestSession &&
				latestSession.status !== lessonAttemptStatus.RESTARTED &&
				latestSession.status !== lessonAttemptStatus.ABANDONED
			) {
				return latestSession;
			}
		}

		return this.createSession({
			interactiveLearningId: input.interactiveLearningId,
			userId: input.userId,
			courseId,
			scope,
			bindingStatus: lessonDefinitionBindingStatus.EXACT,
			revision: targetRevision,
			entryBlockId: targetDefinition.entryBlockId
		});
	}

	static async resetPreviewSession(input: {
		sessionId: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
	}): Promise<InteractiveLessonSession> {
		const view = await this.getSessionView({
			...input,
			skipAutoAgentExecution: true
		});
		this.assertPreviewDebugScope(view.session.scope);

		if (view.currentVisit && view.session.status !== lessonAttemptStatus.COMPLETED) {
			await this.updateBlockVisit({
				visitId: view.currentVisit.id,
				status: lessonBlockVisitStatus.ABANDONED,
				completedAt: new Date()
			});

			if (view.currentBlockState) {
				await this.upsertBlockState({
					sessionId: view.session.id,
					blockId: view.currentBlock.id,
					status: lessonBlockStateStatus.SKIPPED,
					outputs: normalizeOutputs(view.currentBlockState.outputsJson),
					lastChoiceValue: view.currentBlockState.lastChoiceValue ?? undefined,
					chatId: view.currentBlockState.chatId ?? undefined,
					lastVisitId: view.currentVisit.id,
					completedAt: new Date()
				});
			}
		}

		await db
			.update(interactiveLessonSession)
			.set({
				status: lessonAttemptStatus.RESTARTED,
				currentVisitId: null,
				lastActiveAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(interactiveLessonSession.id, view.session.id));

		const newSession = await this.createSession({
			interactiveLearningId: view.activity.id,
			userId: view.session.userId,
			courseId: view.session.courseId,
			scope: view.session.scope,
			bindingStatus: lessonDefinitionBindingStatus.EXACT,
			revision: view.revision,
			entryBlockId: view.definition.entryBlockId
		});

		await this.logEvent({
			interactiveLearningId: view.activity.id,
			sessionId: newSession.id,
			userId: view.session.userId,
			courseId: view.session.courseId,
			visitId: newSession.currentVisitId,
			blockId: view.definition.entryBlockId,
			eventType: lessonEventType.SESSION_RESTARTED,
			payload: {
				restartedFromSessionId: view.session.id,
				attemptNumber: newSession.attemptNumber,
				debugReset: true
			}
		});

		return newSession;
	}

	static async jumpPreviewSessionToBlock(input: {
		sessionId: string;
		blockId: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
	}): Promise<InteractiveLessonSession> {
		const view = await this.getSessionView({
			...input,
			skipAutoAgentExecution: true
		});
		this.assertPreviewDebugScope(view.session.scope);

		if (!view.definition.blocks.some((block) => block.id === input.blockId)) {
			throw new LessonServiceError(404, `El bloque "${input.blockId}" no existe.`);
		}

		if (
			view.session.currentBlockId === input.blockId &&
			view.session.status !== lessonAttemptStatus.COMPLETED
		) {
			return view.session;
		}

		const now = new Date();
		if (
			view.currentVisit &&
			view.currentVisit.status !== lessonBlockVisitStatus.COMPLETED &&
			view.currentVisit.status !== lessonBlockVisitStatus.SKIPPED &&
			view.currentVisit.status !== lessonBlockVisitStatus.ABANDONED
		) {
			await this.updateBlockVisit({
				visitId: view.currentVisit.id,
				status: lessonBlockVisitStatus.ABANDONED,
				completedAt: now
			});
		}

		if (view.currentBlockState?.status === lessonBlockStateStatus.ACTIVE) {
			await this.upsertBlockState({
				sessionId: view.session.id,
				blockId: view.currentBlock.id,
				status: lessonBlockStateStatus.SKIPPED,
				outputs: normalizeOutputs(view.currentBlockState.outputsJson),
				lastChoiceValue: view.currentBlockState.lastChoiceValue ?? undefined,
				chatId: view.currentBlockState.chatId ?? undefined,
				lastVisitId: view.currentVisit?.id ?? view.currentBlockState.lastVisitId ?? undefined,
				completedAt: now
			});
		}

		const nextSessionState = {
			...safeJsonParse<JsonRecord>(view.session.sessionStateJson, {}),
			status: lessonAttemptStatus.ACTIVE,
			currentVisitId: null
		};

		await db
			.update(interactiveLessonSession)
			.set({
				status: lessonAttemptStatus.ACTIVE,
				currentVisitId: null,
				completedAt: null,
				lastActiveAt: now,
				sessionStateJson: JSON.stringify(nextSessionState),
				updatedAt: now
			})
			.where(eq(interactiveLessonSession.id, view.session.id));

		return this.enterBlock(
			{
				...view.session,
				status: lessonAttemptStatus.ACTIVE,
				currentVisitId: null,
				completedAt: null,
				lastActiveAt: now,
				sessionStateJson: JSON.stringify(nextSessionState),
				updatedAt: now
			},
			input.blockId,
			view.activity,
			view.lesson,
			view.definition
		);
	}

	static async restartSession(input: {
		sessionId: string;
		userId: string;
		userRoleLevel: number;
	}): Promise<InteractiveLessonSession> {
		const view = await this.getSessionView(input);

		if (!view.canRestart) {
			throw new LessonServiceError(400, 'Esta lesson no permite reiniciar.');
		}

		if (view.currentVisit && view.session.status !== lessonAttemptStatus.COMPLETED) {
			await this.updateBlockVisit({
				visitId: view.currentVisit.id,
				status: lessonBlockVisitStatus.ABANDONED,
				completedAt: new Date()
			});

			if (view.currentBlockState) {
				await this.upsertBlockState({
					sessionId: view.session.id,
					blockId: view.currentBlock.id,
					status: lessonBlockStateStatus.SKIPPED,
					outputs: normalizeOutputs(view.currentBlockState.outputsJson),
					lastChoiceValue: view.currentBlockState.lastChoiceValue ?? undefined,
					chatId: view.currentBlockState.chatId ?? undefined,
					lastVisitId: view.currentVisit.id,
					completedAt: new Date()
				});
			}
		}

		await db
			.update(interactiveLessonSession)
			.set({
				status: lessonAttemptStatus.RESTARTED,
				currentVisitId: null,
				lastActiveAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(interactiveLessonSession.id, view.session.id));

		const newSession = await this.createSession({
			interactiveLearningId: view.activity.id,
			userId: view.session.userId,
			courseId: view.session.courseId,
			scope: view.session.scope,
			bindingStatus: lessonDefinitionBindingStatus.EXACT,
			revision: view.revision,
			entryBlockId: view.definition.entryBlockId
		});

		await this.logEvent({
			interactiveLearningId: view.activity.id,
			sessionId: newSession.id,
			userId: view.session.userId,
			courseId: view.session.courseId,
			visitId: newSession.currentVisitId,
			blockId: view.definition.entryBlockId,
			eventType: lessonEventType.SESSION_RESTARTED,
			payload: {
				restartedFromSessionId: view.session.id,
				attemptNumber: newSession.attemptNumber
			}
		});

		return newSession;
	}

	static async getSessionView(input: {
		sessionId: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
		skipAutoAgentExecution?: boolean;
	}): Promise<LessonSessionView> {
		const session = await db
			.select()
			.from(interactiveLessonSession)
			.where(eq(interactiveLessonSession.id, input.sessionId))
			.get();

		if (!session) {
			throw new LessonServiceError(404, 'Sesión de lesson no encontrada.');
		}

		if (
			input.interactiveLearningId &&
			session.interactiveLearningId !== input.interactiveLearningId
		) {
			throw new LessonServiceError(404, 'La sesión no pertenece a esta lesson.');
		}

		await this.assertSessionAccess(session, input.userId, input.userRoleLevel);
		await this.ensureSessionVisitBackfill(session);

		const refreshedSession = await db
			.select()
			.from(interactiveLessonSession)
			.where(eq(interactiveLessonSession.id, session.id))
			.get();
		const activeSession = await LessonRevisionService.ensureSessionRevisionBinding(
			refreshedSession ?? session
		);
		const { revision, definition } = await LessonRevisionService.resolveLessonDefinitionForSession({
			sessionId: activeSession.id
		});
		const activityData = await this.getLessonActivity(activeSession.interactiveLearningId);
		const currentBlock = definition.blocks.find(
			(block) => block.id === activeSession.currentBlockId
		);

		if (!currentBlock) {
			throw new LessonServiceError(
				409,
				'El bloque actual ya no existe. Revisa la definición de la lesson.'
			);
		}

		const [blockStates, blockVisits, files] = await Promise.all([
			db
				.select()
				.from(interactiveLessonBlockState)
				.where(eq(interactiveLessonBlockState.sessionId, activeSession.id))
				.all(),
			db
				.select()
				.from(interactiveLessonBlockVisit)
				.where(eq(interactiveLessonBlockVisit.sessionId, activeSession.id))
				.orderBy(interactiveLessonBlockVisit.visitNumber)
				.all(),
			db
				.select()
				.from(interactiveLearningFile)
				.where(eq(interactiveLearningFile.interactiveLearningId, activityData.activity.id))
				.all()
		]);

		const currentBlockState =
			blockStates.find((blockState) => blockState.blockId === currentBlock.id) ?? null;
		const currentVisit =
			blockVisits.find((visit) => visit.id === activeSession.currentVisitId) ??
			blockVisits
				.filter((visit) => visit.blockId === currentBlock.id)
				.sort((left, right) => right.visitNumber - left.visitNumber)[0] ??
			null;
		const filesById = Object.fromEntries(files.map((file) => [file.id, file])) as Record<
			string,
			InteractiveLearningFile
		>;
		const templateContext = this.buildTemplateContext(
			activeSession,
			activityData.activity,
			blockStates
		);
		const resolvedCurrentBlock = this.resolveBlock(currentBlock, templateContext);
		const currentAssets = this.resolveAssets(resolvedCurrentBlock, filesById);
		const isReadOnly =
			(activeSession.scope === lessonSessionScope.LEARNER &&
				activityData.activity.status === 'closed') ||
			activeSession.status === lessonAttemptStatus.COMPLETED;
		const availableReferenceGroups = this.getAvailableReferenceGroups(definition);
		const currentBlockContract = buildLessonBlockContract(currentBlock);
		const currentChatId = currentVisit?.chatId ?? currentBlockState?.chatId ?? null;

		const currentChatMessages =
			currentBlock.kind === 'agent' &&
			currentChatId &&
			!this.isAgentRuntimeEnabled(currentBlock.agentConfig)
				? (await this.loadBlockChatMessages(currentChatId)).filter(
						(message) => message.type !== 'SYSTEM'
					)
				: [];
		const currentAgentMessages =
			currentBlock.kind === 'agent' &&
			currentChatId &&
			this.isAgentRuntimeEnabled(currentBlock.agentConfig)
				? await AgentTranscriptService.getDisplayMessages(currentChatId)
				: [];

		return {
			activity: activityData.activity,
			lesson: activityData.lesson,
			revision,
			definition,
			session: activeSession,
			sessionRevisionInfo: LessonRevisionService.getSessionRevisionInfo(activeSession),
			blockStates,
			blockVisits,
			currentBlock,
			resolvedCurrentBlock,
			currentBlockState,
			currentVisit,
			currentAssets,
			currentChatMessages,
			currentAgentMessages,
			files,
			filesById,
			availableVariables: [
				...availableReferenceGroups.session,
				...availableReferenceGroups.state,
				...availableReferenceGroups.outputs
			],
			availableReferenceGroups,
			currentBlockContract,
			currentVisitId: activeSession.currentVisitId ?? currentVisit?.id ?? null,
			canRestart:
				activityData.lesson.allowRestart &&
				activeSession.userId === input.userId &&
				(activeSession.scope !== lessonSessionScope.LEARNER ||
					activityData.activity.status === 'published'),
			canInteract: !isReadOnly,
			isReadOnly
		};
	}

	static async advanceBlock(input: {
		sessionId: string;
		blockId: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
	}): Promise<InteractiveLessonSession> {
		const view = await this.getSessionView(input);

		if (!view.canInteract) {
			throw new LessonServiceError(403, 'La sesión está en modo solo lectura.');
		}

		if (view.currentBlock.id !== input.blockId) {
			throw new LessonServiceError(409, 'El bloque indicado no es el bloque activo.');
		}

		if (view.currentBlock.kind === 'choice') {
			throw new LessonServiceError(400, 'Debes seleccionar una opción para continuar.');
		}

		if (view.currentBlock.kind === 'end') {
			return view.session;
		}

		if (
			view.currentBlock.kind === 'check' &&
			view.currentVisit?.status !== lessonBlockVisitStatus.COMPLETED &&
			view.currentBlockState?.status !== lessonBlockStateStatus.COMPLETED
		) {
			throw new LessonServiceError(
				400,
				'Este bloque de evaluación debe corregirse antes de continuar.'
			);
		}

		if (
			view.currentBlock.kind === 'youtube' &&
			view.currentVisit?.status !== lessonBlockVisitStatus.COMPLETED &&
			view.currentBlockState?.status !== lessonBlockStateStatus.COMPLETED
		) {
			throw new LessonServiceError(400, 'Debes completar el video configurado antes de avanzar.');
		}

		if (view.currentBlock.kind === 'agent' && (view.currentBlock.requiresResponse ?? true)) {
			const chatId = view.currentVisit?.chatId ?? view.currentBlockState?.chatId;
			const conversationStats =
				chatId && this.isAgentRuntimeEnabled(view.currentBlock.agentConfig)
					? await this.getAgentRuntimeConversationStats(chatId)
					: await this.getAgentConversationStats(chatId);
			if (conversationStats.userInteractionCount === 0) {
				throw new LessonServiceError(
					400,
					'Este bloque IA necesita al menos una intervención del alumno antes de continuar.'
				);
			}
		}

		if (
			view.currentBlock.kind === 'agent' &&
			view.currentBlock.agentConfig.autoStartOnEnter &&
			!normalizeOutputs(view.currentVisit?.outputsJson ?? view.currentBlockState?.outputsJson)
				.response
		) {
			const outputs = normalizeOutputs(
				view.currentVisit?.outputsJson ?? view.currentBlockState?.outputsJson
			);
			if (this.getAgentAutoStartStatus(outputs) === 'failed') {
				throw new LessonServiceError(
					400,
					`El arranque automático del bloque IA falló: ${outputs.autoStartError ?? 'error desconocido'}`
				);
			}

			throw new LessonServiceError(
				400,
				'Este bloque IA todavía no ha generado su arranque automático. Inténtalo de nuevo en unos segundos.'
			);
		}

		return this.completeBlockAndEnterNext(
			view,
			normalizeOutputs(view.currentVisit?.outputsJson ?? view.currentBlockState?.outputsJson)
		);
	}

	static async recordYoutubeProgress(input: {
		sessionId: string;
		blockId: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
		eventType: 'started' | 'pause_point_acknowledged' | 'completed';
		currentTime?: number;
		pausePointId?: string;
		duration?: number;
	}): Promise<{ outputs: JsonRecord; completed: boolean }> {
		const view = await this.getSessionView(input);

		if (!view.canInteract) {
			throw new LessonServiceError(403, 'La sesión está en modo solo lectura.');
		}

		if (view.currentBlock.id !== input.blockId || view.currentBlock.kind !== 'youtube') {
			throw new LessonServiceError(409, 'El bloque activo no es un bloque de YouTube.');
		}

		if (!view.currentVisit) {
			throw new LessonServiceError(409, 'No se pudo resolver la visita activa del bloque.');
		}

		const block = view.currentBlock;
		const currentOutputs = normalizeOutputs(
			view.currentVisit.outputsJson ?? view.currentBlockState?.outputsJson
		);
		const reachedPausePointIds = Array.isArray(currentOutputs.reachedPausePointIds)
			? currentOutputs.reachedPausePointIds.filter(
					(value): value is string => typeof value === 'string'
				)
			: [];

		if (input.eventType === 'pause_point_acknowledged') {
			const pausePointId = input.pausePointId?.trim();
			if (
				!pausePointId ||
				!block.pausePoints?.some((pausePoint) => pausePoint.id === pausePointId)
			) {
				throw new LessonServiceError(400, 'El punto de pausa indicado no existe en este bloque.');
			}

			if (!reachedPausePointIds.includes(pausePointId)) {
				reachedPausePointIds.push(pausePointId);
			}
		}

		const startSeconds = block.startSeconds ?? 0;
		const configuredEndSeconds = block.endSeconds ?? null;
		const finiteDuration =
			typeof input.duration === 'number' && Number.isFinite(input.duration) && input.duration > 0
				? input.duration
				: null;
		const segmentEndSeconds = configuredEndSeconds ?? finiteDuration;
		const segmentLength =
			segmentEndSeconds !== null && segmentEndSeconds > startSeconds
				? segmentEndSeconds - startSeconds
				: finiteDuration;
		const normalizedCurrentTime =
			typeof input.currentTime === 'number' && Number.isFinite(input.currentTime)
				? Math.max(0, input.currentTime)
				: typeof currentOutputs.lastKnownTime === 'number'
					? Math.max(0, currentOutputs.lastKnownTime)
					: startSeconds;
		const watchPercent =
			segmentLength && segmentLength > 0
				? Math.max(0, Math.min(1, (normalizedCurrentTime - startSeconds) / segmentLength))
				: typeof currentOutputs.watchPercent === 'number'
					? Math.max(0, Math.min(1, currentOutputs.watchPercent))
					: 0;
		const completed = input.eventType === 'completed' || currentOutputs.completed === true;
		const completedAt =
			completed && typeof currentOutputs.completedAt === 'string'
				? currentOutputs.completedAt
				: completed
					? new Date().toISOString()
					: undefined;
		const outputs: JsonRecord = {
			...currentOutputs,
			started: currentOutputs.started === true || input.eventType === 'started' || completed,
			completed,
			lastKnownTime: normalizedCurrentTime,
			reachedPausePointIds,
			videoId: block.videoId,
			startSeconds: block.startSeconds ?? null,
			endSeconds: block.endSeconds ?? null,
			watchPercent,
			...(completedAt ? { completedAt } : {})
		};

		const completedDate = completed ? new Date() : null;

		await this.updateBlockVisit({
			visitId: view.currentVisit.id,
			status: completed ? lessonBlockVisitStatus.COMPLETED : lessonBlockVisitStatus.ACTIVE,
			outputs,
			completedAt: completedDate
		});

		await this.upsertBlockState({
			sessionId: view.session.id,
			blockId: block.id,
			status: completed ? lessonBlockStateStatus.COMPLETED : lessonBlockStateStatus.ACTIVE,
			outputs,
			lastVisitId: view.currentVisit.id,
			completedAt: completedDate
		});

		return { outputs, completed };
	}

	static async submitChoice(input: {
		sessionId: string;
		blockId: string;
		optionId: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
	}): Promise<InteractiveLessonSession> {
		const view = await this.getSessionView(input);

		if (!view.canInteract) {
			throw new LessonServiceError(403, 'La sesión está en modo solo lectura.');
		}

		if (view.currentBlock.id !== input.blockId || view.currentBlock.kind !== 'choice') {
			throw new LessonServiceError(409, 'El bloque activo no es un bloque de elección.');
		}

		const resolvedBlock =
			view.resolvedCurrentBlock.kind === 'choice' ? view.resolvedCurrentBlock : null;
		if (!resolvedBlock) {
			throw new LessonServiceError(409, 'No se pudo resolver el bloque de elección actual.');
		}

		const rawOption = view.currentBlock.options.find(
			(candidate) => candidate.id === input.optionId
		);
		const option = resolvedBlock.options.find((candidate) => candidate.id === input.optionId);
		if (!option) {
			throw new LessonServiceError(404, 'La opción seleccionada no existe.');
		}

		const outputKey = view.currentBlock.outputKey || 'selection';
		const outputs = {
			[outputKey]: rawOption?.value ?? option.value,
			selectedValue: rawOption?.value ?? option.value,
			selectedLabel: option.label,
			optionId: option.id
		};

		if (!view.currentVisit) {
			throw new LessonServiceError(409, 'No se pudo resolver la visita activa del bloque.');
		}

		await this.updateBlockVisit({
			visitId: view.currentVisit.id,
			status: lessonBlockVisitStatus.COMPLETED,
			outputs,
			lastChoiceValue: option.value,
			completedAt: new Date()
		});

		await this.upsertBlockState({
			sessionId: view.session.id,
			blockId: view.currentBlock.id,
			status: lessonBlockStateStatus.COMPLETED,
			outputs,
			lastChoiceValue: option.value,
			lastVisitId: view.currentVisit.id,
			completedAt: new Date()
		});

		await this.logEvent({
			interactiveLearningId: view.activity.id,
			sessionId: view.session.id,
			userId: view.session.userId,
			courseId: view.session.courseId,
			visitId: view.currentVisit.id,
			blockId: view.currentBlock.id,
			eventType: lessonEventType.BLOCK_COMPLETED,
			payload: {
				kind: 'choice',
				selectedOptionId: option.id,
				selectedValue: rawOption?.value ?? option.value
			}
		});

		await this.logEvent({
			interactiveLearningId: view.activity.id,
			sessionId: view.session.id,
			userId: view.session.userId,
			courseId: view.session.courseId,
			visitId: view.currentVisit.id,
			blockId: view.currentBlock.id,
			eventType: lessonEventType.BRANCH_TAKEN,
			payload: {
				targetBlockId: option.targetBlockId,
				label: option.label,
				value: rawOption?.value ?? option.value
			}
		});

		return this.enterBlock(
			view.session,
			option.targetBlockId,
			view.activity,
			view.lesson,
			view.definition
		);
	}

	static async submitCheck(input: {
		sessionId: string;
		blockId: string;
		optionIds?: string[];
		value?: string | number;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
	}): Promise<{
		session: InteractiveLessonSession;
		outputs: JsonRecord;
		completed: boolean;
	}> {
		const view = await this.getSessionView(input);

		if (!view.canInteract) {
			throw new LessonServiceError(403, 'La sesión está en modo solo lectura.');
		}

		if (view.currentBlock.id !== input.blockId || view.currentBlock.kind !== 'check') {
			throw new LessonServiceError(409, 'El bloque activo no es un bloque de evaluación.');
		}

		const resolvedBlock =
			view.resolvedCurrentBlock.kind === 'check' ? view.resolvedCurrentBlock : null;
		if (!resolvedBlock) {
			throw new LessonServiceError(409, 'No se pudo resolver el bloque de evaluación actual.');
		}

		if (!view.currentVisit) {
			throw new LessonServiceError(
				409,
				'No se pudo resolver la visita activa del bloque de evaluación.'
			);
		}

		if (
			view.currentVisit.status === lessonBlockVisitStatus.COMPLETED ||
			view.currentBlockState?.status === lessonBlockStateStatus.COMPLETED
		) {
			throw new LessonServiceError(
				400,
				'Este bloque de evaluación ya está cerrado. Pulsa continuar para seguir.'
			);
		}

		const currentOutputs = normalizeOutputs(
			view.currentVisit.outputsJson ?? view.currentBlockState?.outputsJson
		);
		const result = this.evaluateCheckSubmission({
			block: resolvedBlock,
			rawOptionIds: input.optionIds,
			rawValue: input.value,
			currentOutputs
		});

		await this.updateBlockVisit({
			visitId: view.currentVisit.id,
			status: result.completed ? lessonBlockVisitStatus.COMPLETED : lessonBlockVisitStatus.ACTIVE,
			outputs: result.outputs,
			completedAt: result.completed ? new Date() : null,
			metadata: result.metadata
		});

		await this.upsertBlockState({
			sessionId: view.session.id,
			blockId: view.currentBlock.id,
			status: result.completed ? lessonBlockStateStatus.COMPLETED : lessonBlockStateStatus.ACTIVE,
			outputs: result.outputs,
			lastVisitId: view.currentVisit.id,
			completedAt: result.completed ? new Date() : null
		});

		if (result.completed) {
			await this.logEvent({
				interactiveLearningId: view.activity.id,
				sessionId: view.session.id,
				userId: view.session.userId,
				courseId: view.session.courseId,
				visitId: view.currentVisit.id,
				blockId: view.currentBlock.id,
				eventType: lessonEventType.BLOCK_COMPLETED,
				payload: {
					kind: 'check',
					mode: resolvedBlock.checkConfig.mode,
					score: result.outputs.score ?? 0,
					passed: result.outputs.passed ?? false,
					attemptCount: result.outputs.attemptCount ?? 0
				}
			});
		}

		if (shouldTrackLessonProgress(view.session.scope)) {
			await markActivityInProgress({
				userId: view.session.userId,
				courseId: view.session.courseId,
				activityId: view.activity.id,
				activityType: 'lesson',
				source: 'lesson:check-submit'
			});
		}

		return {
			session: view.session,
			outputs: result.outputs,
			completed: result.completed
		};
	}

	static async submitAgentTurn(input: {
		sessionId: string;
		blockId: string;
		message: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
	}): Promise<{
		session: InteractiveLessonSession;
		assistantMessage: string;
		outputs: JsonRecord;
	}> {
		const prepared = await this.prepareManualAgentExecution(input);
		const assistantMessage = await AIUtils.generateTextFromMessages(
			prepared.generationMessages,
			prepared.modelName,
			this.buildAgentExecutionContext(prepared.view, prepared.blockVisit.chatId!)
		);

		return this.completePreparedAgentExecution(prepared, assistantMessage);
	}

	static async createAgentResponseStream(input: {
		sessionId: string;
		blockId: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
		message?: string;
		autoStart?: boolean;
	}): Promise<{
		textStream: LessonAgentStreamResult['textStream'];
		complete: (assistantMessage: string) => Promise<{
			session: InteractiveLessonSession;
			assistantMessage: string;
			outputs: JsonRecord;
		}>;
		fail: (message: string) => Promise<void>;
	}> {
		const prepared = input.autoStart
			? await this.prepareAutoAgentExecution(input)
			: await this.prepareManualAgentExecution({
					...input,
					message: input.message ?? ''
				});
		const streamResult = await AIUtils.streamTextFromMessages(
			prepared.generationMessages,
			prepared.modelName,
			this.buildAgentExecutionContext(prepared.view, prepared.blockVisit.chatId!)
		);

		return {
			textStream: streamResult.textStream,
			complete: async (assistantMessage: string) =>
				this.completePreparedAgentExecution(prepared, assistantMessage),
			fail: async (message: string) => {
				if (prepared.autoStarted) {
					await this.markAgentAutoStartFailed(prepared.view, prepared.blockVisit, message);
				}
			}
		};
	}

	private static async prepareManualAgentExecution(input: {
		sessionId: string;
		blockId: string;
		message: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
	}): Promise<PreparedLessonAgentExecution> {
		const userMessage = input.message.trim();
		if (!userMessage) {
			throw new LessonServiceError(400, 'El mensaje no puede estar vacío.');
		}

		const view = await this.getSessionView({
			...input,
			skipAutoAgentExecution: true
		});

		this.assertAgentBlockInteractionAccess(view, input.blockId);
		this.assertManualAgentExecutionAllowed(view);

		const currentOutputs = normalizeOutputs(
			view.currentVisit?.outputsJson ?? view.currentBlockState?.outputsJson
		);
		if (view.currentBlock.agentConfig.autoStartOnEnter && !currentOutputs.response) {
			throw new LessonServiceError(
				409,
				'Este bloque IA debe completar antes su arranque automático.'
			);
		}

		await this.assertManualAgentTurnCapacity(view);

		const blockVisit = await this.ensureAgentBlockChat(view);
		const modelName = await this.resolveLessonModel(view.currentBlock);

		await this.assertAgentTurnLimit(view.currentBlock, blockVisit.chatId);
		await AIUtils.saveMessage(blockVisit.chatId!, userMessage, 'USER');
		const generationMessages = await this.loadModelMessages(blockVisit.chatId!);

		return {
			view,
			blockVisit,
			modelName,
			currentOutputs,
			generationMessages,
			outputMessagesBase: generationMessages,
			userMessage,
			autoStarted: false
		};
	}

	private static async prepareAutoAgentExecution(input: {
		sessionId: string;
		blockId: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
	}): Promise<PreparedLessonAgentExecution> {
		const view = await this.getSessionView({
			...input,
			skipAutoAgentExecution: true
		});

		this.assertAgentBlockInteractionAccess(view, input.blockId);
		this.assertAutoAgentExecutionAllowed(view);

		const currentOutputs = normalizeOutputs(
			view.currentVisit?.outputsJson ?? view.currentBlockState?.outputsJson
		);
		const blockVisit = await this.ensureAgentBlockChat(view);
		await this.markAgentAutoStartStatus(view, blockVisit, 'streaming');
		const modelName = await this.resolveLessonModel(view.currentBlock);
		const outputMessagesBase = await this.loadModelMessages(blockVisit.chatId!);
		const launchMessage = await this.buildAutoAgentLaunchMessage(view);

		return {
			view,
			blockVisit,
			modelName,
			currentOutputs,
			generationMessages: [
				...outputMessagesBase,
				{ role: 'user' as const, content: launchMessage }
			],
			outputMessagesBase,
			userMessage: '',
			autoStarted: true
		};
	}

	private static async completePreparedAgentExecution(
		prepared: PreparedLessonAgentExecution,
		assistantMessage: string
	): Promise<{
		session: InteractiveLessonSession;
		assistantMessage: string;
		outputs: JsonRecord;
	}> {
		await AIUtils.saveMessage(prepared.blockVisit.chatId!, assistantMessage, 'ASSISTANT');

		const updatedOutputMessages = [
			...prepared.outputMessagesBase,
			{ role: 'assistant' as const, content: assistantMessage }
		];
		const extractedOutputs = await this.extractAgentOutputs({
			block: prepared.view.currentBlock as LessonAgentBlock,
			modelName: prepared.modelName,
			assistantMessage,
			userMessage: prepared.userMessage,
			messages: updatedOutputMessages,
			currentOutputs: prepared.currentOutputs,
			autoStarted: prepared.autoStarted,
			context: this.buildAgentExecutionContext(prepared.view, prepared.blockVisit.chatId!)
		});
		const outputs = {
			...prepared.currentOutputs,
			...extractedOutputs
		};

		await this.updateBlockVisit({
			visitId: prepared.blockVisit.id,
			status: lessonBlockVisitStatus.ACTIVE,
			outputs,
			chatId: prepared.blockVisit.chatId!
		});

		await this.upsertBlockState({
			sessionId: prepared.view.session.id,
			blockId: prepared.view.currentBlock.id,
			status: lessonBlockStateStatus.ACTIVE,
			outputs,
			chatId: prepared.blockVisit.chatId!,
			lastVisitId: prepared.blockVisit.id
		});

		if (!prepared.autoStarted && shouldTrackLessonProgress(prepared.view.session.scope)) {
			await markActivityInProgress({
				userId: prepared.view.session.userId,
				courseId: prepared.view.session.courseId,
				activityId: prepared.view.activity.id,
				activityType: 'lesson',
				source: 'lesson:agent-turn'
			});
		}

		return {
			session: prepared.view.session,
			assistantMessage,
			outputs
		};
	}

	private static buildAgentExecutionContext(
		view: LessonSessionView,
		chatId: string
	): {
		userId: string;
		courseId: string;
		interactiveLearningId: string;
		chatId: string;
	} {
		return {
			userId: view.session.userId,
			courseId: view.session.courseId,
			interactiveLearningId: view.activity.id,
			chatId
		};
	}

	private static assertAgentBlockInteractionAccess(
		view: LessonSessionView,
		blockId: string
	): asserts view is LessonSessionView & {
		currentBlock: LessonAgentBlock;
		resolvedCurrentBlock: LessonAgentBlock;
	} {
		if (!view.canInteract) {
			throw new LessonServiceError(403, 'La sesión está en modo solo lectura.');
		}

		if (view.currentBlock.id !== blockId || view.currentBlock.kind !== 'agent') {
			throw new LessonServiceError(409, 'El bloque activo no es un bloque IA.');
		}

		if (view.resolvedCurrentBlock.kind !== 'agent') {
			throw new LessonServiceError(409, 'No se pudo resolver el bloque IA actual.');
		}
	}

	private static assertManualAgentExecutionAllowed(
		view: LessonSessionView & {
			currentBlock: LessonAgentBlock;
		}
	): void {
		if (
			view.currentBlock.agentConfig.executionTrigger !== 'on_user_submit' ||
			!isLessonAgentInteractive(view.currentBlock.agentConfig)
		) {
			throw new LessonServiceError(
				400,
				'Este bloque IA se ejecuta automaticamente y no admite mensajes manuales.'
			);
		}
	}

	private static assertAutoAgentExecutionAllowed(
		view: LessonSessionView & {
			currentBlock: LessonAgentBlock;
		}
	): void {
		if (!this.shouldAutoExecuteAgentBlock(view.currentBlock)) {
			throw new LessonServiceError(400, 'Este bloque IA no se autoarranca al entrar.');
		}

		const currentOutputs = normalizeOutputs(
			view.currentVisit?.outputsJson ?? view.currentBlockState?.outputsJson
		);
		const autoStartStatus = this.getAgentAutoStartStatus(currentOutputs);
		if (currentOutputs.response || autoStartStatus === 'completed') {
			throw new LessonServiceError(
				409,
				'Este bloque IA ya completó su arranque automático en esta visita.'
			);
		}

		if (autoStartStatus === 'streaming' || autoStartStatus === 'pending') {
			throw new LessonServiceError(
				409,
				'Este bloque IA ya tiene un arranque automático en curso para esta visita.'
			);
		}
	}

	private static async assertManualAgentTurnCapacity(
		view: LessonSessionView & {
			currentBlock: LessonAgentBlock;
		}
	): Promise<void> {
		if (view.currentBlock.agentConfig.interactionMode !== 'single_turn') {
			return;
		}

		const chatId = view.currentVisit?.chatId ?? view.currentBlockState?.chatId;
		const conversationStats =
			chatId && this.isAgentRuntimeEnabled(view.currentBlock.agentConfig)
				? await this.getAgentRuntimeConversationStats(chatId)
				: await this.getAgentConversationStats(chatId);
		if (conversationStats.userInteractionCount >= 1) {
			throw new LessonServiceError(
				400,
				'Este bloque de respuesta guiada ya consumió la única intervención del alumno. Pulsa continuar para seguir.'
			);
		}
	}

	private static async assertAgentTurnLimit(
		block: LessonAgentBlock,
		chatId: string | null | undefined
	): Promise<void> {
		const maxTurns = block.agentConfig.maxTurns ?? null;
		if (!maxTurns || !chatId) return;

		const conversationStats = this.isAgentRuntimeEnabled(block.agentConfig)
			? await this.getAgentRuntimeConversationStats(chatId)
			: await this.getAgentConversationStats(chatId);
		if (conversationStats.userInteractionCount >= maxTurns) {
			throw new LessonServiceError(400, 'Este bloque ya alcanzó el máximo de turnos permitidos.');
		}
	}

	private static getAgentAutoStartStatus(outputs: JsonRecord): LessonAgentAutoStartStatus {
		const rawStatus = outputs.autoStartStatus;
		if (
			rawStatus === 'pending' ||
			rawStatus === 'streaming' ||
			rawStatus === 'completed' ||
			rawStatus === 'failed'
		) {
			return rawStatus;
		}

		return outputs.autoStarted || outputs.response ? 'completed' : 'idle';
	}

	private static async markAgentAutoStartStatus(
		view: LessonSessionView & { currentBlock: LessonAgentBlock },
		blockVisit: InteractiveLessonBlockVisit,
		status: LessonAgentAutoStartStatus,
		errorMessage?: string
	): Promise<void> {
		const currentOutputs = normalizeOutputs(
			blockVisit.outputsJson ??
				view.currentVisit?.outputsJson ??
				view.currentBlockState?.outputsJson
		);
		const outputs = {
			...currentOutputs,
			autoStarted: status === 'completed' || Boolean(currentOutputs.autoStarted),
			autoStartStatus: status,
			...(errorMessage ? { autoStartError: errorMessage } : { autoStartError: null })
		};

		await this.updateBlockVisit({
			visitId: blockVisit.id,
			status: lessonBlockVisitStatus.ACTIVE,
			outputs,
			chatId: blockVisit.chatId ?? undefined
		});

		await this.upsertBlockState({
			sessionId: view.session.id,
			blockId: view.currentBlock.id,
			status: lessonBlockStateStatus.ACTIVE,
			outputs,
			chatId: blockVisit.chatId ?? undefined,
			lastVisitId: blockVisit.id
		});
	}

	private static async markAgentAutoStartFailed(
		view: LessonSessionView & { currentBlock: LessonAgentBlock },
		blockVisit: InteractiveLessonBlockVisit,
		message: string
	): Promise<void> {
		await this.markAgentAutoStartStatus(view, blockVisit, 'failed', message);
	}

	private static evaluateCheckSubmission(input: {
		block: LessonCheckBlock;
		rawOptionIds?: string[];
		rawValue?: string | number;
		currentOutputs: JsonRecord;
	}): LessonCheckSubmissionResult {
		const config = normalizeLessonCheckConfig(input.block.checkConfig);
		const previousAttemptCount =
			typeof input.currentOutputs.attemptCount === 'number'
				? input.currentOutputs.attemptCount
				: Number(input.currentOutputs.attemptCount ?? 0);
		const attemptCount = Number.isFinite(previousAttemptCount) ? previousAttemptCount + 1 : 1;
		let score = 0;
		let feedback = '';
		let answerOutputs: JsonRecord = {};
		let metadata: JsonRecord = {};

		if (
			config.mode === 'single_choice' ||
			config.mode === 'multiple_choice' ||
			config.mode === 'true_false'
		) {
			const selectedOptionIds = [...new Set(input.rawOptionIds ?? [])];
			const optionMap = new Map(config.options.map((option) => [option.id, option]));
			for (const optionId of selectedOptionIds) {
				if (!optionMap.has(optionId)) {
					throw new LessonServiceError(
						400,
						`La opción "${optionId}" no existe en este bloque de evaluación.`
					);
				}
			}

			if (selectedOptionIds.length === 0) {
				throw new LessonServiceError(400, 'Debes enviar al menos una respuesta.');
			}

			if (config.mode !== 'multiple_choice' && selectedOptionIds.length !== 1) {
				throw new LessonServiceError(400, 'Este bloque de evaluación solo acepta una respuesta.');
			}

			score = scoreCheckOptionSelection(selectedOptionIds, config.correctOptionIds, config.mode);
			answerOutputs = {
				selectedOptionIds,
				selectedValues: selectedOptionIds
					.map((optionId) => optionMap.get(optionId)?.value)
					.filter((value): value is string => typeof value === 'string'),
				selectedLabels: selectedOptionIds
					.map((optionId) => optionMap.get(optionId)?.label)
					.filter((value): value is string => typeof value === 'string')
			};
			metadata = {
				...metadata,
				correctOptionIds: config.correctOptionIds
			};
		}

		if (config.mode === 'numeric') {
			const numericValue =
				typeof input.rawValue === 'number' ? input.rawValue : Number(String(input.rawValue ?? ''));
			if (!Number.isFinite(numericValue)) {
				throw new LessonServiceError(400, 'Debes enviar un valor numérico válido.');
			}

			const tolerance = config.tolerance ?? 0;
			const exactMatch =
				config.acceptedExact !== null && Math.abs(numericValue - config.acceptedExact) <= tolerance;
			const rangeMatch =
				config.acceptedRange &&
				(config.acceptedRange.min === undefined || numericValue >= config.acceptedRange.min) &&
				(config.acceptedRange.max === undefined || numericValue <= config.acceptedRange.max);
			score = exactMatch || rangeMatch ? 1 : 0;
			answerOutputs = {
				answerNumber: numericValue
			};
			metadata = {
				...metadata,
				acceptedExact: config.acceptedExact,
				acceptedRange: config.acceptedRange ?? null,
				tolerance
			};
		}

		if (config.mode === 'short_text') {
			const rawText = String(input.rawValue ?? '');
			if (!rawText.trim()) {
				throw new LessonServiceError(400, 'Debes escribir una respuesta antes de enviar.');
			}

			const normalizedCandidate = normalizeCheckTextValue(rawText, {
				trimWhitespace: config.trimWhitespace,
				caseSensitive: config.caseSensitive
			});
			const acceptedAnswers = config.acceptedAnswers.map((answer) =>
				normalizeCheckTextValue(answer, {
					trimWhitespace: config.trimWhitespace,
					caseSensitive: config.caseSensitive
				})
			);
			score = acceptedAnswers.some((acceptedAnswer) =>
				matchShortTextAnswer(normalizedCandidate, acceptedAnswer, config.matchMode)
			)
				? 1
				: 0;
			answerOutputs = {
				answerText: rawText
			};
			metadata = {
				...metadata,
				matchMode: config.matchMode
			};
		}

		const passed = score >= config.passingScore;
		const isCorrect = score >= 1;
		const exhausted =
			config.maxAttempts !== null ? attemptCount >= Math.max(config.maxAttempts, 1) : false;
		const completed = config.completionRule === 'after_first_submit' ? true : passed || exhausted;
		const attemptsRemaining =
			config.maxAttempts === null ? null : Math.max(config.maxAttempts - attemptCount, 0);

		if (passed) {
			feedback =
				config.feedbackCorrect?.trim() || 'Respuesta correcta. Puedes continuar cuando quieras.';
		} else if (completed && attemptsRemaining === 0) {
			feedback =
				config.feedbackIncorrect?.trim() ||
				'La respuesta no es correcta y ya no quedan más intentos en este bloque.';
		} else if (score > 0 && score < 1) {
			feedback =
				config.feedbackPartial?.trim() || 'Respuesta parcialmente correcta. Revisa tu selección.';
		} else {
			feedback =
				config.feedbackIncorrect?.trim() ||
				'La respuesta no es correcta. Puedes intentarlo de nuevo.';
		}

		return {
			outputs: {
				...input.currentOutputs,
				submitted: true,
				passed,
				isCorrect,
				score,
				attemptCount,
				attemptsRemaining,
				feedback,
				mode: config.mode,
				...answerOutputs
			},
			metadata,
			completed
		};
	}

	private static async purgePreviewSessions(input: {
		interactiveLearningId: string;
		userId: string;
		courseId: string;
		scope: InteractiveLessonSession['scope'];
	}): Promise<void> {
		const sessions = await db
			.select({ id: interactiveLessonSession.id })
			.from(interactiveLessonSession)
			.where(
				and(
					eq(interactiveLessonSession.interactiveLearningId, input.interactiveLearningId),
					eq(interactiveLessonSession.userId, input.userId),
					eq(interactiveLessonSession.courseId, input.courseId),
					eq(interactiveLessonSession.scope, input.scope)
				)
			)
			.all();

		if (sessions.length === 0) return;

		const sessionIds = sessions.map((session) => session.id);
		const [visitChatRows, stateChatRows] = await Promise.all([
			db
				.select({ chatId: interactiveLessonBlockVisit.chatId })
				.from(interactiveLessonBlockVisit)
				.where(
					and(
						inArray(interactiveLessonBlockVisit.sessionId, sessionIds),
						isNotNull(interactiveLessonBlockVisit.chatId)
					)
				)
				.all(),
			db
				.select({ chatId: interactiveLessonBlockState.chatId })
				.from(interactiveLessonBlockState)
				.where(
					and(
						inArray(interactiveLessonBlockState.sessionId, sessionIds),
						isNotNull(interactiveLessonBlockState.chatId)
					)
				)
				.all()
		]);
		const chatIds = [
			...new Set(
				[...visitChatRows, ...stateChatRows]
					.map((row) => row.chatId)
					.filter((chatId): chatId is string => Boolean(chatId))
			)
		];

		db.transaction((tx) => {
			if (chatIds.length > 0) {
				tx.delete(agentMessage).where(inArray(agentMessage.chatId, chatIds)).run();
				tx.delete(message).where(inArray(message.chatId, chatIds)).run();
			}

			tx.delete(interactiveLessonSession)
				.where(inArray(interactiveLessonSession.id, sessionIds))
				.run();

			if (chatIds.length > 0) {
				tx.delete(chat).where(inArray(chat.id, chatIds)).run();
			}
		});
	}

	private static async createSession(input: {
		interactiveLearningId: string;
		userId: string;
		courseId: string;
		scope: InteractiveLessonSession['scope'];
		bindingStatus: InteractiveLessonSession['bindingStatus'];
		revision: InteractiveLearningLessonRevision;
		entryBlockId: string;
	}): Promise<InteractiveLessonSession> {
		const [attemptStats] = await db
			.select({ maxAttempt: max(interactiveLessonSession.attemptNumber) })
			.from(interactiveLessonSession)
			.where(
				and(
					eq(interactiveLessonSession.interactiveLearningId, input.interactiveLearningId),
					eq(interactiveLessonSession.userId, input.userId),
					eq(interactiveLessonSession.courseId, input.courseId),
					eq(interactiveLessonSession.scope, input.scope),
					isNotNull(interactiveLessonSession.definitionRevisionId)
				)
			);
		const attemptNumber = (attemptStats?.maxAttempt ?? 0) + 1;
		const now = new Date();
		const sessionId = nanoid();

		await db.insert(interactiveLessonSession).values({
			id: sessionId,
			interactiveLearningId: input.interactiveLearningId,
			userId: input.userId,
			courseId: input.courseId,
			attemptNumber,
			definitionRevisionId: input.revision.id,
			definitionRevisionNumber: input.revision.revisionNumber,
			bindingStatus: input.bindingStatus,
			scope: input.scope,
			status: lessonAttemptStatus.ACTIVE,
			currentBlockId: input.entryBlockId,
			currentVisitId: null,
			sessionStateJson: JSON.stringify({ attemptNumber }),
			startedAt: now,
			lastActiveAt: now,
			createdAt: now,
			updatedAt: now
		});

		await this.logEvent({
			interactiveLearningId: input.interactiveLearningId,
			sessionId,
			userId: input.userId,
			courseId: input.courseId,
			blockId: input.entryBlockId,
			eventType: lessonEventType.SESSION_STARTED,
			payload: { attemptNumber }
		});

		if (shouldTrackLessonProgress(input.scope)) {
			await markActivityInProgress({
				userId: input.userId,
				courseId: input.courseId,
				activityId: input.interactiveLearningId,
				activityType: 'lesson',
				source: 'lesson:create-session'
			});
		}

		const activityData = await this.getLessonActivity(input.interactiveLearningId);

		return this.enterBlock(
			{
				id: sessionId,
				interactiveLearningId: input.interactiveLearningId,
				userId: input.userId,
				courseId: input.courseId,
				attemptNumber,
				definitionRevisionId: input.revision.id,
				definitionRevisionNumber: input.revision.revisionNumber,
				bindingStatus: input.bindingStatus,
				scope: input.scope,
				status: lessonAttemptStatus.ACTIVE,
				currentBlockId: input.entryBlockId,
				currentVisitId: null,
				sessionStateJson: JSON.stringify({ attemptNumber }),
				startedAt: now,
				lastActiveAt: now,
				completedAt: null,
				createdAt: now,
				updatedAt: now
			},
			input.entryBlockId,
			activityData.activity,
			activityData.lesson,
			LessonRevisionService.parseDefinition(input.revision.definitionJson)
		);
	}

	private static async completeBlockAndEnterNext(
		view: LessonSessionView,
		outputs: JsonRecord
	): Promise<InteractiveLessonSession> {
		const transition = this.resolveTransition(
			view.currentBlock,
			view.session,
			view.activity,
			view.blockStates
		);
		if (!transition?.targetBlockId) {
			throw new LessonServiceError(
				400,
				`El bloque "${view.currentBlock.id}" no tiene salida disponible con el estado actual.`
			);
		}

		if (!view.currentVisit) {
			throw new LessonServiceError(409, 'No se pudo resolver la visita activa del bloque.');
		}

		await this.updateBlockVisit({
			visitId: view.currentVisit.id,
			status: lessonBlockVisitStatus.COMPLETED,
			outputs,
			completedAt: new Date()
		});

		await this.upsertBlockState({
			sessionId: view.session.id,
			blockId: view.currentBlock.id,
			status: lessonBlockStateStatus.COMPLETED,
			outputs,
			lastVisitId: view.currentVisit.id,
			completedAt: new Date()
		});

		await this.logEvent({
			interactiveLearningId: view.activity.id,
			sessionId: view.session.id,
			userId: view.session.userId,
			courseId: view.session.courseId,
			visitId: view.currentVisit.id,
			blockId: view.currentBlock.id,
			eventType: lessonEventType.BLOCK_COMPLETED,
			payload: {
				kind: view.currentBlock.kind,
				targetBlockId: transition.targetBlockId
			}
		});

		if ('condition' in transition || 'label' in transition) {
			await this.logEvent({
				interactiveLearningId: view.activity.id,
				sessionId: view.session.id,
				userId: view.session.userId,
				courseId: view.session.courseId,
				visitId: view.currentVisit.id,
				blockId: view.currentBlock.id,
				eventType: lessonEventType.BRANCH_TAKEN,
				payload: {
					targetBlockId: transition.targetBlockId,
					label: transition.label ?? null,
					condition: transition.condition ?? null
				}
			});
		}

		return this.enterBlock(
			view.session,
			transition.targetBlockId,
			view.activity,
			view.lesson,
			view.definition
		);
	}

	private static async enterBlock(
		session: InteractiveLessonSession,
		blockId: string,
		activity: InteractiveLearning,
		lesson: InteractiveLearningLesson,
		definition: LessonDefinition
	): Promise<InteractiveLessonSession> {
		const block = definition.blocks.find((item) => item.id === blockId);
		if (!block) {
			throw new LessonServiceError(404, `El bloque "${blockId}" no existe.`);
		}

		const now = new Date();
		const nextStatus =
			block.kind === 'end' ? lessonAttemptStatus.COMPLETED : lessonAttemptStatus.ACTIVE;
		const visit = await this.createBlockVisit({
			sessionId: session.id,
			blockId,
			status:
				block.kind === 'end' ? lessonBlockVisitStatus.COMPLETED : lessonBlockVisitStatus.ACTIVE,
			completedAt: block.kind === 'end' ? now : null
		});

		await this.upsertBlockState({
			sessionId: session.id,
			blockId,
			status:
				block.kind === 'end' ? lessonBlockStateStatus.COMPLETED : lessonBlockStateStatus.ACTIVE,
			lastVisitId: visit.id,
			incrementVisitCount: true,
			enteredAt: visit.enteredAt,
			completedAt: visit.completedAt ?? null
		});

		await db
			.update(interactiveLessonSession)
			.set({
				currentBlockId: blockId,
				currentVisitId: visit.id,
				status: nextStatus,
				lastActiveAt: now,
				completedAt: block.kind === 'end' ? now : null,
				sessionStateJson: JSON.stringify({
					...safeJsonParse<JsonRecord>(session.sessionStateJson, {}),
					currentBlockId: blockId,
					currentVisitId: visit.id,
					status: nextStatus
				}),
				updatedAt: now
			})
			.where(eq(interactiveLessonSession.id, session.id));

		await this.logEvent({
			interactiveLearningId: activity.id,
			sessionId: session.id,
			userId: session.userId,
			courseId: session.courseId,
			visitId: visit.id,
			blockId,
			eventType: lessonEventType.BLOCK_ENTERED,
			payload: { kind: block.kind, title: block.title }
		});

		if (block.kind === 'end') {
			await this.logEvent({
				interactiveLearningId: activity.id,
				sessionId: session.id,
				userId: session.userId,
				courseId: session.courseId,
				visitId: visit.id,
				blockId,
				eventType: lessonEventType.SESSION_COMPLETED,
				payload: { attemptNumber: session.attemptNumber }
			});

			if (shouldTrackLessonProgress(session.scope)) {
				await markActivityCompleted({
					userId: session.userId,
					courseId: session.courseId,
					activityId: activity.id,
					activityType: 'lesson',
					source: 'lesson:end-block'
				});
			}
		}

		const updatedSession = await db
			.select()
			.from(interactiveLessonSession)
			.where(eq(interactiveLessonSession.id, session.id))
			.get();

		if (!updatedSession) {
			throw new LessonServiceError(500, 'No se pudo recargar la sesión de lesson.');
		}

		return updatedSession;
	}

	private static async ensureAgentBlockChat(
		view: LessonSessionView
	): Promise<InteractiveLessonBlockVisit> {
		if (view.currentBlock.kind !== 'agent') {
			throw new LessonServiceError(400, 'El bloque activo no es IA.');
		}

		if (view.resolvedCurrentBlock.kind !== 'agent') {
			throw new LessonServiceError(409, 'No se pudo resolver el bloque IA actual.');
		}

		if (!view.currentVisit) {
			throw new LessonServiceError(409, 'No se pudo resolver la visita activa del bloque IA.');
		}

		if (view.currentVisit.chatId) {
			return view.currentVisit;
		}

		const now = new Date();
		const chatId = nanoid();
		const resolvedBlock = view.resolvedCurrentBlock;
		const systemPrompt = resolvedBlock.agentConfig.systemPrompt?.trim() || '';
		const promptTemplate = resolvedBlock.agentConfig.promptTemplate.trim();
		const baseSystemPrompt = [systemPrompt, promptTemplate].filter(Boolean).join('\n\n');
		const usesAgentRuntime = this.isAgentRuntimeEnabled(resolvedBlock.agentConfig);

		await db.insert(chat).values({
			id: chatId,
			userId: view.session.userId,
			title: `${view.activity.name} · ${resolvedBlock.title}`,
			metadata: JSON.stringify({
				kind: 'lesson_block',
				sessionId: view.session.id,
				blockId: view.currentBlock.id,
				interactiveLearningId: view.activity.id
			}),
			createdAt: now,
			updatedAt: now
		});

		if (!usesAgentRuntime && baseSystemPrompt) {
			await AIUtils.saveMessage(chatId, baseSystemPrompt, 'SYSTEM');
		}

		if (
			isLessonAgentInteractive(resolvedBlock.agentConfig) &&
			resolvedBlock.agentConfig.initialAssistantMessage?.trim()
		) {
			if (usesAgentRuntime) {
				await DBAgentMessageUtils.saveAgentMessage({
					chatId,
					role: 'assistant',
					textContent: resolvedBlock.agentConfig.initialAssistantMessage.trim(),
					sequenceOrder: 1
				});
			} else {
				await AIUtils.saveMessage(
					chatId,
					resolvedBlock.agentConfig.initialAssistantMessage.trim(),
					'ASSISTANT'
				);
			}
		}

		await this.updateBlockVisit({
			visitId: view.currentVisit.id,
			status: lessonBlockVisitStatus.ACTIVE,
			outputs: normalizeOutputs(
				view.currentVisit.outputsJson ?? view.currentBlockState?.outputsJson
			),
			chatId
		});

		await this.upsertBlockState({
			sessionId: view.session.id,
			blockId: view.currentBlock.id,
			status: lessonBlockStateStatus.ACTIVE,
			outputs: normalizeOutputs(
				view.currentVisit.outputsJson ?? view.currentBlockState?.outputsJson
			),
			chatId,
			lastVisitId: view.currentVisit.id
		});

		const updatedVisit = await db
			.select()
			.from(interactiveLessonBlockVisit)
			.where(eq(interactiveLessonBlockVisit.id, view.currentVisit.id))
			.get();

		if (!updatedVisit) {
			throw new LessonServiceError(500, 'No se pudo inicializar el bloque IA.');
		}

		return updatedVisit;
	}

	private static flattenAgentDisplayMessage(message: AgentDisplayMessage): {
		transcriptContent: string;
		textContent: string;
	} {
		const transcriptParts: string[] = [];
		const textParts: string[] = [];

		for (const part of message.parts) {
			if (part.kind === 'text') {
				if (part.content.trim()) {
					transcriptParts.push(part.content.trim());
					textParts.push(part.content.trim());
				}
				continue;
			}

			if (part.kind === 'tool-call') {
				transcriptParts.push(
					`[tool:${part.toolName}|status:${part.status}] ${part.displayResult ?? JSON.stringify(part.result ?? {})}`
				);
				continue;
			}

			if (part.kind === 'ui-component') {
				transcriptParts.push(
					`[ui:${part.componentKey}] ${JSON.stringify({
						props: part.props,
						userResponse: part.userResponse ?? null
					})}`
				);
			}
		}

		return {
			transcriptContent: transcriptParts.join('\n'),
			textContent: textParts.join('\n')
		};
	}

	private static async getAgentRuntimeConversationStats(
		chatId: string
	): Promise<AgentConversationStats> {
		const displayMessages = await AgentTranscriptService.getDisplayMessages(chatId);
		return this.countVisibleAgentConversationStats(displayMessages);
	}

	private static async buildAgentOutputMessagesFromTranscript(chatId: string): Promise<{
		messages: ModelMessage[];
		lastAssistantMessage: string;
		lastUserMessage: string;
		conversationStats: AgentConversationStats;
	}> {
		const displayMessages = await AgentTranscriptService.getDisplayMessages(chatId);
		const messages: ModelMessage[] = [];
		let lastAssistantMessage = '';
		let lastUserMessage = '';

		for (const displayMessage of displayMessages) {
			const flattened = this.flattenAgentDisplayMessage(displayMessage);
			if (!flattened.transcriptContent.trim()) continue;

			messages.push({
				role: displayMessage.role,
				content: flattened.transcriptContent
			});

			if (displayMessage.role === 'assistant' && flattened.textContent.trim()) {
				lastAssistantMessage = flattened.textContent.trim();
			}

			if (displayMessage.role === 'user' && flattened.textContent.trim()) {
				lastUserMessage = flattened.textContent.trim();
			}
		}

		return {
			messages,
			lastAssistantMessage,
			lastUserMessage,
			conversationStats: this.countVisibleAgentConversationStats(displayMessages)
		};
	}

	static async getLessonAgentRuntimeContext(input: {
		sessionId: string;
		blockId: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
		resume?: boolean;
	}): Promise<{
		view: LessonSessionView & {
			currentBlock: LessonAgentBlock;
			resolvedCurrentBlock: LessonAgentBlock;
		};
		blockVisit: InteractiveLessonBlockVisit;
		context: AgentContext;
	}> {
		const view = (await this.getSessionView({
			sessionId: input.sessionId,
			userId: input.userId,
			userRoleLevel: input.userRoleLevel,
			interactiveLearningId: input.interactiveLearningId,
			skipAutoAgentExecution: true
		})) as LessonSessionView & {
			currentBlock: LessonAgentBlock;
			resolvedCurrentBlock: LessonAgentBlock;
		};

		this.assertAgentBlockInteractionAccess(view, input.blockId);

		if (!this.isAgentRuntimeEnabled(view.currentBlock.agentConfig)) {
			throw new LessonServiceError(
				400,
				'Este bloque IA está configurado en modo basic y no usa el runtime agéntico.'
			);
		}

		const blockVisit = await this.ensureAgentBlockChat(view);
		const enabledTools = await resolveLessonAgentTools({
			allowedAgentToolIds: view.definition.allowedAgentToolIds,
			enabledToolIds: view.currentBlock.agentConfig.enabledToolIds,
			includePersistentTools: view.session.scope === lessonSessionScope.LEARNER
		});
		const enabledUIComponentKeys = deriveEnabledUIComponentKeysFromTools(enabledTools);
		const templateContext = this.buildTemplateContext(
			view.session,
			view.activity,
			view.blockStates
		);
		const resolvedBody = view.resolvedCurrentBlock.body?.trim();
		const llmContext = [
			view.currentBlock.agentConfig.promptTemplate.trim(),
			resolvedBody ? `Contenido visible del bloque:\n${resolvedBody}` : null,
			`Contexto estructurado de la lesson:\n${JSON.stringify(templateContext, null, 2)}`
		]
			.filter(Boolean)
			.join('\n\n');

		const context: AgentContext = {
			userId: view.session.userId,
			courseId: view.session.courseId,
			chatId: blockVisit.chatId!,
			activityId: view.activity.id,
			activityConfig: {
				llmModel: view.currentBlock.agentConfig.model ?? null,
				llmRole: 'Tutor de una lesson interactiva',
				llmInstructions:
					view.currentBlock.agentConfig.systemPrompt?.trim() ||
					'Acompaña al estudiante dentro de este bloque de lesson. Mantén el foco en el objetivo pedagógico del bloque actual y usa las tools disponibles cuando aporten valor.',
				llmContext,
				systemPrompt: null,
				temperature: null,
				maxTokens: null,
				topP: null,
				maxToolRoundtrips: 5,
				parallelToolCalls: false,
				toolChoice: enabledTools.length > 0 ? 'auto' : 'none',
				finalizationEnabled: false,
				finalizationToolName: 'finalize_activity',
				finalizationHandler: 'mark_complete_only',
				finalizationConfig: null,
				requireFinalizationToolCall: false,
				ragEnabled: false,
				ragCollectionName: null,
				ragConfig: null
			},
			enabledTools,
			enabledUIComponentKeys,
			messageHistory: input.resume
				? []
				: await DBAgentMessageUtils.getAgentMessages(blockVisit.chatId!)
		};

		return { view, blockVisit, context };
	}

	static async createLessonAgentStream(input: {
		sessionId: string;
		blockId: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
		message?: string;
		userMessageMetadata?: string;
		autoStart?: boolean;
		resume?: boolean;
	}) {
		const runtime = await this.getLessonAgentRuntimeContext({
			sessionId: input.sessionId,
			blockId: input.blockId,
			userId: input.userId,
			userRoleLevel: input.userRoleLevel,
			interactiveLearningId: input.interactiveLearningId,
			resume: input.resume
		});

		if (!input.resume) {
			let userMessage = input.message?.trim() ?? '';
			if (input.autoStart) {
				this.assertAutoAgentExecutionAllowed(runtime.view);
				userMessage = await this.buildAutoAgentLaunchMessage(runtime.view);
				await this.markAgentAutoStartStatus(runtime.view, runtime.blockVisit, 'streaming');
			} else {
				this.assertManualAgentExecutionAllowed(runtime.view);
				await this.assertManualAgentTurnCapacity(runtime.view);
				await this.assertAgentTurnLimit(runtime.view.currentBlock, runtime.blockVisit.chatId);
			}

			if (!userMessage) {
				throw new LessonServiceError(400, 'El mensaje no puede estar vacío.');
			}

			return AgentEngine.executeLoop(runtime.context, userMessage, input.userMessageMetadata);
		}

		return AgentEngine.resumeFromToolCall(runtime.context);
	}

	static async syncLessonAgentBlockOutputs(input: {
		sessionId: string;
		blockId: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
	}): Promise<JsonRecord> {
		const runtime = await this.getLessonAgentRuntimeContext({
			sessionId: input.sessionId,
			blockId: input.blockId,
			userId: input.userId,
			userRoleLevel: input.userRoleLevel,
			interactiveLearningId: input.interactiveLearningId
		});
		const modelName = await this.resolveLessonModel(runtime.view.currentBlock);
		const currentOutputs = normalizeOutputs(
			runtime.view.currentVisit?.outputsJson ?? runtime.view.currentBlockState?.outputsJson
		);
		const transcriptPayload = await this.buildAgentOutputMessagesFromTranscript(
			runtime.blockVisit.chatId!
		);
		const extractedOutputs = await this.extractAgentOutputs({
			block: runtime.view.currentBlock,
			modelName,
			assistantMessage:
				transcriptPayload.lastAssistantMessage || String(currentOutputs.response ?? ''),
			userMessage: transcriptPayload.lastUserMessage,
			messages: transcriptPayload.messages,
			conversationStats: transcriptPayload.conversationStats,
			currentOutputs,
			autoStarted:
				Boolean(currentOutputs.autoStarted) ||
				(runtime.view.currentBlock.agentConfig.autoStartOnEnter &&
					transcriptPayload.messages.some((message) => message.role === 'assistant')),
			context: this.buildAgentExecutionContext(runtime.view, runtime.blockVisit.chatId!)
		});
		const outputs = {
			...currentOutputs,
			...extractedOutputs
		};

		await this.updateBlockVisit({
			visitId: runtime.blockVisit.id,
			status: lessonBlockVisitStatus.ACTIVE,
			outputs,
			chatId: runtime.blockVisit.chatId!
		});

		await this.upsertBlockState({
			sessionId: runtime.view.session.id,
			blockId: runtime.view.currentBlock.id,
			status: lessonBlockStateStatus.ACTIVE,
			outputs,
			chatId: runtime.blockVisit.chatId!,
			lastVisitId: runtime.blockVisit.id
		});

		return outputs;
	}

	static async failLessonAgentAutoStart(input: {
		sessionId: string;
		blockId: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
		message: string;
	}): Promise<void> {
		const runtime = await this.getLessonAgentRuntimeContext({
			sessionId: input.sessionId,
			blockId: input.blockId,
			userId: input.userId,
			userRoleLevel: input.userRoleLevel,
			interactiveLearningId: input.interactiveLearningId
		});

		await this.markAgentAutoStartFailed(runtime.view, runtime.blockVisit, input.message);
	}

	private static async extractAgentOutputs(input: {
		block: LessonAgentBlock;
		modelName: string;
		assistantMessage: string;
		userMessage: string;
		messages: ModelMessage[];
		conversationStats?: AgentConversationStats;
		currentOutputs: JsonRecord;
		autoStarted: boolean;
		context: {
			userId?: string;
			courseId?: string;
			interactiveLearningId?: string;
			chatId?: string;
		};
	}): Promise<JsonRecord> {
		const conversationStats =
			input.conversationStats ?? this.countAgentConversationStats(input.messages);
		const outputSchema = input.block.agentConfig.outputSchema ?? [];
		const autoStarted = Boolean(input.currentOutputs.autoStarted) || input.autoStarted;
		const currentAutoStartStatus = this.getAgentAutoStartStatus(input.currentOutputs);
		const autoStartStatus: LessonAgentAutoStartStatus = autoStarted
			? input.assistantMessage.trim()
				? 'completed'
				: currentAutoStartStatus === 'failed'
					? 'failed'
					: currentAutoStartStatus
			: 'idle';
		const baseOutputs: JsonRecord = {
			response: input.assistantMessage,
			lastUserMessage:
				input.userMessage ||
				(typeof input.currentOutputs.lastUserMessage === 'string'
					? input.currentOutputs.lastUserMessage
					: ''),
			interactionMode: input.block.agentConfig.interactionMode,
			executionTrigger: input.block.agentConfig.executionTrigger,
			autoStartOnEnter: input.block.agentConfig.autoStartOnEnter,
			hasUserResponse: conversationStats.userInteractionCount > 0,
			userTurnCount: conversationStats.userTurns,
			uiResponseCount: conversationStats.uiResponseCount,
			userInteractionCount: conversationStats.userInteractionCount,
			assistantTurnCount: conversationStats.assistantTurns,
			autoStarted,
			autoStartStatus,
			autoStartError:
				autoStartStatus === 'failed' ? (input.currentOutputs.autoStartError ?? null) : null,
			extractionStatus: outputSchema.length > 0 ? 'failed' : 'not_configured',
			extractionMessage:
				outputSchema.length > 0
					? 'La salida estructurada todavia no se ha extraido.'
					: 'Este bloque no define salida estructurada.',
			extractionMissingFields: [],
			extractionCoercedFields: [],
			extractionFailedFields: []
		};

		if (outputSchema.length === 0) {
			return baseOutputs;
		}

		const transcript = input.messages
			.map((message) => `${message.role.toUpperCase()}: ${String(message.content)}`)
			.join('\n\n');

		try {
			const extractionMessages: ModelMessage[] = [
				{
					role: 'system',
					content: [
						'Eres un extractor de datos para una lesson basada en grafo.',
						'Extrae únicamente datos observables en la conversación.',
						'Si un campo no está respaldado por la conversación, déjalo ausente.'
					].join('\n')
				},
				{
					role: 'user',
					content: [
						'Campos requeridos por el autor:',
						outputSchema
							.map(
								(field) =>
									`- ${field.key} (${field.type}): ${field.description || 'Sin descripción.'}`
							)
							.join('\n'),
						'Conversación:',
						transcript
					].join('\n\n')
				}
			];
			const parsed = await AIUtils.generateObjectFromMessages(
				extractionMessages,
				input.modelName,
				this.buildLessonOutputExtractionSchema(outputSchema),
				input.context
			);
			const parsedRecord = parsed as JsonRecord;
			const audit: LessonAgentOutputExtractionAudit = {
				status: 'ok',
				message: 'Salida estructurada extraida correctamente.',
				missingFields: [],
				coercedFields: [],
				failedFields: []
			};

			for (const field of outputSchema) {
				const rawValue = parsedRecord[field.key];
				const result = coerceOutputValueWithAudit(rawValue, field);
				baseOutputs[field.key] = result.value;

				if (rawValue === undefined || rawValue === null) {
					audit.missingFields.push(field.key);
					continue;
				}

				if (result.coerced) {
					audit.coercedFields.push(field.key);
				}

				if (!result.valid) {
					audit.failedFields.push(field.key);
				}
			}

			if (audit.failedFields.length > 0) {
				audit.status = 'failed';
				audit.message = `No se pudieron validar los campos: ${audit.failedFields.join(', ')}.`;
			} else if (audit.missingFields.length > 0) {
				audit.status = 'missing_field';
				audit.message = `Faltan campos sin evidencia suficiente: ${audit.missingFields.join(', ')}.`;
			} else if (audit.coercedFields.length > 0) {
				audit.status = 'coerced';
				audit.message = `Se extrajeron campos con conversion de tipo: ${audit.coercedFields.join(', ')}.`;
			}

			baseOutputs.extractionStatus = audit.status;
			baseOutputs.extractionMessage = audit.message;
			baseOutputs.extractionMissingFields = audit.missingFields;
			baseOutputs.extractionCoercedFields = audit.coercedFields;
			baseOutputs.extractionFailedFields = audit.failedFields;
		} catch (error) {
			console.warn('[LessonService] No se pudo extraer salida estructurada', error);
			baseOutputs.extractionStatus = 'failed';
			baseOutputs.extractionMessage =
				error instanceof Error
					? `No se pudo extraer salida estructurada: ${error.message}`
					: 'No se pudo extraer salida estructurada.';
			baseOutputs.extractionFailedFields = outputSchema.map((field) => field.key);
		}

		return baseOutputs;
	}

	private static buildLessonOutputExtractionSchema(outputSchema: LessonOutputField[]) {
		return z.object(
			Object.fromEntries(
				outputSchema.map((field) => {
					if (field.type === 'number') return [field.key, z.number().optional().nullable()];
					if (field.type === 'boolean') return [field.key, z.boolean().optional().nullable()];
					if (field.type === 'json') return [field.key, z.unknown().optional().nullable()];
					return [field.key, z.string().optional().nullable()];
				})
			)
		);
	}

	private static async assertSessionAccess(
		session: InteractiveLessonSession,
		userId: string,
		userRoleLevel: number
	): Promise<void> {
		if (session.userId === userId) return;

		const access = await CourseInteractiveAuthUtils.userCanAccessChatInCourse(
			userId,
			session.userId,
			session.courseId,
			userRoleLevel
		);

		if (!access.allowed) {
			throw new LessonServiceError(403, access.reason || 'No tienes acceso a esta sesión.');
		}
	}

	private static assertPreviewDebugScope(scope: InteractiveLessonSession['scope']): void {
		if (
			scope !== lessonSessionScope.PREVIEW_DRAFT &&
			scope !== lessonSessionScope.PREVIEW_PUBLISHED
		) {
			throw new LessonServiceError(
				403,
				'El modo depuración solo está disponible para sesiones preview.'
			);
		}
	}

	private static async getLessonActivity(interactiveLearningId: string): Promise<{
		activity: InteractiveLearning;
		lesson: InteractiveLearningLesson;
	}> {
		const [activity, lesson] = await Promise.all([
			db
				.select()
				.from(interactiveLearning)
				.where(eq(interactiveLearning.id, interactiveLearningId))
				.get(),
			db
				.select()
				.from(interactiveLearningLesson)
				.where(eq(interactiveLearningLesson.id, interactiveLearningId))
				.get()
		]);

		if (!activity || activity.type !== 'lesson') {
			throw new LessonServiceError(404, 'Actividad lesson no encontrada.');
		}

		if (!lesson) {
			throw new LessonServiceError(
				500,
				'La actividad lesson no tiene configuración runtime asociada.'
			);
		}

		return { activity, lesson };
	}

	private static async resolveCourseId(
		interactiveLearningId: string,
		courseId: string | null | undefined
	): Promise<string> {
		if (courseId) {
			const belongsToCourse = await CourseInteractiveAuthUtils.verifyInteractiveBelongsToCourse(
				courseId,
				interactiveLearningId
			);
			if (!belongsToCourse) {
				throw new LessonServiceError(400, 'La lesson no pertenece al curso indicado.');
			}
			return courseId;
		}

		const relation = await db
			.select({ courseId: courseInteractiveLearning.courseId })
			.from(courseInteractiveLearning)
			.where(eq(courseInteractiveLearning.interactiveLearningId, interactiveLearningId))
			.get();

		if (!relation?.courseId) {
			throw new LessonServiceError(400, 'La lesson no está asociada a ningún curso.');
		}

		return relation.courseId;
	}

	private static async ensureSessionVisitBackfill(
		session: InteractiveLessonSession
	): Promise<void> {
		const [blockStates, blockVisits] = await Promise.all([
			db
				.select()
				.from(interactiveLessonBlockState)
				.where(eq(interactiveLessonBlockState.sessionId, session.id))
				.all(),
			db
				.select()
				.from(interactiveLessonBlockVisit)
				.where(eq(interactiveLessonBlockVisit.sessionId, session.id))
				.orderBy(interactiveLessonBlockVisit.visitNumber)
				.all()
		]);

		const latestByBlock = new Map<string, InteractiveLessonBlockVisit>();

		if (blockVisits.length === 0 && blockStates.length > 0) {
			const orderedStates = [...blockStates].sort((left, right) => {
				const leftTime = (left.enteredAt ?? left.createdAt).getTime();
				const rightTime = (right.enteredAt ?? right.createdAt).getTime();
				return leftTime - rightTime;
			});

			for (const blockState of orderedStates) {
				const visit = await this.createBlockVisit({
					sessionId: session.id,
					blockId: blockState.blockId,
					status:
						blockState.status === lessonBlockStateStatus.COMPLETED
							? lessonBlockVisitStatus.COMPLETED
							: blockState.status === lessonBlockStateStatus.SKIPPED
								? lessonBlockVisitStatus.SKIPPED
								: lessonBlockVisitStatus.ACTIVE,
					outputs: normalizeOutputs(blockState.outputsJson),
					lastChoiceValue: blockState.lastChoiceValue ?? undefined,
					chatId: blockState.chatId ?? undefined,
					enteredAt: blockState.enteredAt ?? blockState.createdAt,
					completedAt: blockState.completedAt ?? null,
					metadata: {
						backfilled: true,
						sourceBlockStateId: blockState.id
					}
				});

				latestByBlock.set(blockState.blockId, visit);

				await db
					.update(interactiveLessonBlockState)
					.set({
						lastVisitId: visit.id,
						updatedAt: new Date()
					})
					.where(eq(interactiveLessonBlockState.id, blockState.id));
			}
		} else {
			for (const visit of blockVisits) {
				const existing = latestByBlock.get(visit.blockId);
				if (!existing || visit.visitNumber >= existing.visitNumber) {
					latestByBlock.set(visit.blockId, visit);
				}
			}
		}

		for (const blockState of blockStates) {
			const latestVisit = latestByBlock.get(blockState.blockId);
			if (!latestVisit || blockState.lastVisitId === latestVisit.id) continue;
			await db
				.update(interactiveLessonBlockState)
				.set({
					lastVisitId: latestVisit.id,
					updatedAt: new Date()
				})
				.where(eq(interactiveLessonBlockState.id, blockState.id));
		}

		const currentVisitId =
			session.currentVisitId ?? latestByBlock.get(session.currentBlockId)?.id ?? null;

		if (currentVisitId && session.currentVisitId !== currentVisitId) {
			await db
				.update(interactiveLessonSession)
				.set({
					currentVisitId,
					sessionStateJson: JSON.stringify({
						...safeJsonParse<JsonRecord>(session.sessionStateJson, {}),
						currentVisitId
					}),
					updatedAt: new Date()
				})
				.where(eq(interactiveLessonSession.id, session.id));
		}

		const events = await db
			.select()
			.from(interactiveLessonEvent)
			.where(eq(interactiveLessonEvent.sessionId, session.id))
			.all();

		for (const event of events) {
			if (event.visitId || !event.blockId) continue;
			const visit = latestByBlock.get(event.blockId);
			if (!visit) continue;
			await db
				.update(interactiveLessonEvent)
				.set({ visitId: visit.id })
				.where(eq(interactiveLessonEvent.id, event.id));
		}
	}

	private static buildTemplateContext(
		session: InteractiveLessonSession,
		activity: InteractiveLearning,
		blockStates: InteractiveLessonBlockState[]
	): LessonTemplateContext {
		return {
			session: {
				id: session.id,
				attemptNumber: session.attemptNumber,
				status: session.status,
				currentBlockId: session.currentBlockId,
				currentVisitId: session.currentVisitId,
				activityName: activity.name,
				courseId: session.courseId
			},
			blocks: Object.fromEntries(
				blockStates.map((blockState) => [
					blockState.blockId,
					{
						state: {
							status: blockState.status,
							visitCount: blockState.visitCount,
							enteredAt: blockState.enteredAt?.toISOString() ?? null,
							completedAt: blockState.completedAt?.toISOString() ?? null,
							lastVisitId: blockState.lastVisitId,
							available: blockState.lastVisitId !== null && blockState.lastVisitId !== undefined
						},
						outputs: {
							visited: blockState.visitCount > 0,
							completed: blockState.status === lessonBlockStateStatus.COMPLETED,
							...normalizeOutputs(blockState.outputsJson)
						}
					}
				])
			) as LessonTemplateContext['blocks']
		};
	}

	private static resolveStringTemplate(
		template: string | null | undefined,
		context: LessonTemplateContext
	): string {
		if (!template) return '';

		return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression) => {
			const value = this.resolveTemplateValue(expression.trim(), context);
			if (value === null || value === undefined) return '';
			if (typeof value === 'object') return JSON.stringify(value);
			return String(value);
		});
	}

	private static resolveTemplateValue(path: string, context: LessonTemplateContext): unknown {
		if (path.startsWith('session.')) {
			return path
				.split('.')
				.slice(1)
				.reduce<unknown>((current, segment) => {
					if (!current || typeof current !== 'object') return undefined;
					return (current as Record<string, unknown>)[segment];
				}, context.session);
		}

		if (!path.startsWith('blocks.')) return undefined;

		const [, blockId, scope, ...rest] = path.split('.');
		if (!blockId || (scope !== 'outputs' && scope !== 'state')) return undefined;
		return rest.reduce<unknown>(
			(current, segment) => {
				if (!current || typeof current !== 'object') return undefined;
				return (current as Record<string, unknown>)[segment];
			},
			scope === 'state' ? context.blocks[blockId]?.state : context.blocks[blockId]?.outputs
		);
	}

	private static shouldAutoExecuteAgentBlock(block: LessonAgentBlock): boolean {
		return block.agentConfig.autoStartOnEnter;
	}

	private static isAgentRuntimeEnabled(
		config: Pick<LessonAgentBlock['agentConfig'], 'runtimeMode'>
	): boolean {
		return config.runtimeMode === 'agent';
	}

	private static async executeAgentOnEnter(view: LessonSessionView): Promise<void> {
		if (
			view.currentBlock.kind === 'agent' &&
			this.isAgentRuntimeEnabled(view.currentBlock.agentConfig)
		) {
			const generator = await this.createLessonAgentStream({
				sessionId: view.session.id,
				blockId: view.currentBlock.id,
				userId: view.session.userId,
				userRoleLevel: Number.MAX_SAFE_INTEGER,
				interactiveLearningId: view.activity.id,
				autoStart: true
			});

			for await (const part of generator) {
				// El stream ya persiste mensajes, tools y UI en sus tablas propias.
				void part;
			}

			await this.syncLessonAgentBlockOutputs({
				sessionId: view.session.id,
				blockId: view.currentBlock.id,
				userId: view.session.userId,
				userRoleLevel: Number.MAX_SAFE_INTEGER,
				interactiveLearningId: view.activity.id
			});
			return;
		}

		const prepared = await this.prepareAutoAgentExecution({
			sessionId: view.session.id,
			blockId: view.currentBlock.id,
			userId: view.session.userId,
			userRoleLevel: Number.MAX_SAFE_INTEGER,
			interactiveLearningId: view.activity.id
		});
		const assistantMessage = await AIUtils.generateTextFromMessages(
			prepared.generationMessages,
			prepared.modelName,
			this.buildAgentExecutionContext(prepared.view, prepared.blockVisit.chatId!)
		);

		await this.completePreparedAgentExecution(prepared, assistantMessage);
	}

	private static async buildAutoAgentLaunchMessage(view: LessonSessionView): Promise<string> {
		if (view.resolvedCurrentBlock.kind !== 'agent') {
			throw new LessonServiceError(400, 'El bloque resuelto no es un bloque IA.');
		}

		const templateContext = this.buildTemplateContext(
			view.session,
			view.activity,
			view.blockStates
		);
		const visibleHistory = await this.buildSessionHistoryBundle(view, templateContext);
		const launchTemplate =
			view.resolvedCurrentBlock.agentConfig.launchMessageTemplate?.trim() ||
			'Genera la respuesta prevista para este bloque usando todo el contexto previo de la lesson.';

		return [
			launchTemplate,
			`Bloque actual: ${view.resolvedCurrentBlock.title}`,
			view.resolvedCurrentBlock.body?.trim()
				? `Contenido visible del bloque actual:\n${view.resolvedCurrentBlock.body.trim()}`
				: null,
			'Contexto estructurado disponible:',
			JSON.stringify(templateContext, null, 2),
			'Historial visible de la sesion hasta este punto:',
			visibleHistory
		]
			.filter(Boolean)
			.join('\n\n')
			.replace(/^/, '[[AUTO_START_LESSON_BLOCK\n')
			.concat('\n]]');
	}

	private static async buildSessionHistoryBundle(
		view: LessonSessionView,
		context: LessonTemplateContext
	): Promise<string> {
		const currentVisitNumber = view.currentVisit?.visitNumber ?? Number.POSITIVE_INFINITY;
		const priorVisits = view.blockVisits.filter((visit) => visit.visitNumber < currentVisitNumber);

		if (priorVisits.length === 0) {
			return 'Todavia no hay historial previo en esta sesion.';
		}

		const sections: string[] = [];
		for (const visit of priorVisits) {
			const block = view.definition.blocks.find((candidate) => candidate.id === visit.blockId);
			if (!block) continue;

			const resolvedBlock = this.resolveBlock(block, context);
			const outputs = normalizeOutputs(visit.outputsJson);
			const heading = `Bloque ${visit.visitNumber}: ${resolvedBlock.title} (${block.kind})`;

			if (resolvedBlock.kind === 'content') {
				sections.push(
					`${heading}\nContenido:\n${this.truncateForPrompt(resolvedBlock.body || 'Sin contenido visible.')}`
				);
				continue;
			}

			if (resolvedBlock.kind === 'choice') {
				const selectedLabel =
					outputs.selectedLabel ?? outputs.selectedValue ?? visit.lastChoiceValue;
				sections.push(`${heading}\nSeleccion: ${selectedLabel || 'Sin seleccion registrada.'}`);
				continue;
			}

			if (resolvedBlock.kind === 'check') {
				const score =
					typeof outputs.score === 'number' ? outputs.score : Number(outputs.score ?? 0);
				const feedback = typeof outputs.feedback === 'string' ? outputs.feedback : '';
				sections.push(
					`${heading}\nResultado: ${outputs.passed ? 'superado' : 'no superado'} · score ${Number.isFinite(score) ? score : 0}\nFeedback:\n${feedback || 'Sin feedback visible.'}`
				);
				continue;
			}

			if (resolvedBlock.kind === 'agent') {
				let transcript = outputs.response
					? `IA: ${String(outputs.response)}`
					: 'Sin transcript visible.';

				if (visit.chatId) {
					if (this.isAgentRuntimeEnabled(resolvedBlock.agentConfig)) {
						const displayMessages = await AgentTranscriptService.getDisplayMessages(visit.chatId);
						if (displayMessages.length > 0) {
							transcript = displayMessages
								.map((message) => {
									const role = message.role === 'user' ? 'Alumno' : 'IA';
									const flattened = this.flattenAgentDisplayMessage(message);
									return `${role}: ${flattened.transcriptContent || 'Sin contenido visible.'}`;
								})
								.join('\n\n');
						}
					} else {
						const visibleMessages = (await this.loadBlockChatMessages(visit.chatId)).filter(
							(message) => message.type !== 'SYSTEM'
						);
						if (visibleMessages.length > 0) {
							transcript = visibleMessages
								.map((message) => {
									const role =
										message.type === 'USER'
											? 'Alumno'
											: message.type === 'ASSISTANT'
												? 'IA'
												: 'Sistema';
									return `${role}: ${message.content}`;
								})
								.join('\n\n');
						}
					}
				}

				sections.push(`${heading}\nTranscript:\n${this.truncateForPrompt(transcript)}`);
				continue;
			}

			if (resolvedBlock.kind === 'end') {
				sections.push(`${heading}\nSesion marcada como finalizada en este nodo.`);
			}
		}

		return sections.join('\n\n---\n\n');
	}

	private static truncateForPrompt(value: string, limit = 2400): string {
		const trimmed = value.trim();
		if (trimmed.length <= limit) return trimmed;
		return `${trimmed.slice(0, limit)}...`;
	}

	private static resolveBlock(block: LessonBlock, context: LessonTemplateContext): LessonBlock {
		if (block.kind === 'agent') {
			return {
				...block,
				title: this.resolveStringTemplate(block.title, context),
				body: this.resolveStringTemplate(block.body || '', context),
				agentConfig: {
					...block.agentConfig,
					placeholder: this.resolveStringTemplate(block.agentConfig.placeholder || '', context),
					submitLabel: this.resolveStringTemplate(block.agentConfig.submitLabel || '', context),
					continueLabel: this.resolveStringTemplate(block.agentConfig.continueLabel || '', context),
					systemPrompt: this.resolveStringTemplate(block.agentConfig.systemPrompt || '', context),
					promptTemplate: this.resolveStringTemplate(block.agentConfig.promptTemplate, context),
					initialAssistantMessage: this.resolveStringTemplate(
						block.agentConfig.initialAssistantMessage || '',
						context
					),
					launchMessageTemplate: this.resolveStringTemplate(
						block.agentConfig.launchMessageTemplate || '',
						context
					)
				}
			};
		}

		if (block.kind === 'choice') {
			return {
				...block,
				title: this.resolveStringTemplate(block.title, context),
				body: this.resolveStringTemplate(block.body || '', context),
				options: block.options.map((option) => ({
					...option,
					label: this.resolveStringTemplate(option.label, context),
					description: this.resolveStringTemplate(option.description || '', context)
				}))
			};
		}

		if (block.kind === 'check') {
			return {
				...block,
				title: this.resolveStringTemplate(block.title, context),
				body: this.resolveStringTemplate(block.body || '', context),
				checkConfig: {
					...block.checkConfig,
					submitLabel: this.resolveStringTemplate(block.checkConfig.submitLabel || '', context),
					continueLabel: this.resolveStringTemplate(block.checkConfig.continueLabel || '', context),
					retryLabel: this.resolveStringTemplate(block.checkConfig.retryLabel || '', context),
					feedbackCorrect: this.resolveStringTemplate(
						block.checkConfig.feedbackCorrect || '',
						context
					),
					feedbackIncorrect: this.resolveStringTemplate(
						block.checkConfig.feedbackIncorrect || '',
						context
					),
					feedbackPartial: this.resolveStringTemplate(
						block.checkConfig.feedbackPartial || '',
						context
					),
					options: block.checkConfig.options.map((option) => ({
						...option,
						label: this.resolveStringTemplate(option.label, context),
						description: this.resolveStringTemplate(option.description || '', context)
					}))
				}
			};
		}

		if (block.kind === 'content') {
			return {
				...block,
				title: this.resolveStringTemplate(block.title, context),
				body: this.resolveStringTemplate(block.body, context),
				continueLabel: this.resolveStringTemplate(block.continueLabel || '', context)
			};
		}

		if (block.kind === 'youtube') {
			return {
				...block,
				title: this.resolveStringTemplate(block.title, context),
				body: this.resolveStringTemplate(block.body || '', context),
				continueLabel: this.resolveStringTemplate(block.continueLabel || '', context),
				pausePoints: (block.pausePoints ?? []).map((pausePoint) => ({
					...pausePoint,
					title: this.resolveStringTemplate(pausePoint.title || '', context),
					body: this.resolveStringTemplate(pausePoint.body || '', context),
					resumeLabel: this.resolveStringTemplate(pausePoint.resumeLabel || '', context)
				}))
			};
		}

		return {
			...block,
			title: this.resolveStringTemplate(block.title, context),
			body: this.resolveStringTemplate(block.body || '', context),
			ctaLabel: this.resolveStringTemplate(block.ctaLabel || '', context)
		};
	}

	private static resolveAssets(
		block: LessonBlock,
		filesById: Record<string, InteractiveLearningFile>
	): LessonResolvedAsset[] {
		if (block.kind !== 'content') return [];

		return (block.assetRefs ?? [])
			.map((asset) => {
				const file = filesById[asset.fileId];
				if (!file) return null;
				const kind =
					asset.kind ||
					(file.mimeType.startsWith('image/')
						? 'image'
						: file.mimeType.startsWith('video/')
							? 'video'
							: file.mimeType.startsWith('audio/')
								? 'audio'
								: 'file');

				return {
					fileId: asset.fileId,
					caption: asset.caption,
					kind,
					url: file.path,
					name: file.name,
					mimeType: file.mimeType
				} satisfies LessonResolvedAsset;
			})
			.filter(Boolean) as LessonResolvedAsset[];
	}

	private static resolveTransition(
		block: LessonBlock,
		session: InteractiveLessonSession,
		activity: InteractiveLearning,
		blockStates: InteractiveLessonBlockState[]
	): LessonTransition | { targetBlockId: string } | null {
		const context = this.buildTemplateContext(session, activity, blockStates);

		for (const branch of block.branches ?? []) {
			if (
				!branch.condition ||
				this.evaluateCondition(
					branch.condition.operator,
					this.resolveTemplateValue(branch.condition.source, context),
					branch.condition.value
				)
			) {
				return {
					...branch,
					label: this.resolveStringTemplate(branch.label || '', context)
				};
			}
		}

		if (block.next) return { targetBlockId: block.next };
		return null;
	}

	private static evaluateCondition(
		operator: LessonConditionOperator,
		left: unknown,
		right: unknown
	): boolean {
		if (operator === 'equals') return left === right;
		if (operator === 'not_equals') return left !== right;
		if (operator === 'contains') return String(left ?? '').includes(String(right ?? ''));
		if (operator === 'exists') return left !== undefined && left !== null && String(left) !== '';
		if (operator === 'not_exists')
			return left === undefined || left === null || String(left) === '';
		if (operator === 'gt') return Number(left) > Number(right);
		if (operator === 'gte') return Number(left) >= Number(right);
		if (operator === 'lt') return Number(left) < Number(right);
		if (operator === 'lte') return Number(left) <= Number(right);
		return false;
	}

	private static async upsertBlockState(input: {
		sessionId: string;
		blockId: string;
		status: InteractiveLessonBlockState['status'];
		scope?: InteractiveLessonSession['scope'];
		outputs?: JsonRecord;
		lastChoiceValue?: string;
		chatId?: string;
		lastVisitId?: string;
		incrementVisitCount?: boolean;
		enteredAt?: Date | null;
		completedAt?: Date | null;
	}): Promise<void> {
		const existing = await db
			.select()
			.from(interactiveLessonBlockState)
			.where(
				and(
					eq(interactiveLessonBlockState.sessionId, input.sessionId),
					eq(interactiveLessonBlockState.blockId, input.blockId)
				)
			)
			.get();
		const now = new Date();
		const scope = input.scope ?? (await this.resolveSessionScope(input.sessionId));
		const serializedOutputs = input.outputs ? JSON.stringify(input.outputs) : undefined;
		const shouldIncrementVisit = Boolean(input.incrementVisitCount);

		if (existing) {
			await db
				.update(interactiveLessonBlockState)
				.set({
					status: input.status,
					visitCount: shouldIncrementVisit ? existing.visitCount + 1 : existing.visitCount,
					lastVisitId: input.lastVisitId ?? existing.lastVisitId,
					enteredAt:
						(shouldIncrementVisit ? input.enteredAt : undefined) ??
						existing.enteredAt ??
						input.enteredAt ??
						null,
					completedAt:
						input.status === lessonBlockStateStatus.COMPLETED
							? (input.completedAt ?? now)
							: input.status === lessonBlockStateStatus.ACTIVE
								? null
								: (input.completedAt ?? existing.completedAt),
					lastChoiceValue: input.lastChoiceValue ?? existing.lastChoiceValue,
					outputsJson: serializedOutputs ?? existing.outputsJson,
					chatId: input.chatId ?? existing.chatId,
					updatedAt: now
				})
				.where(eq(interactiveLessonBlockState.id, existing.id));
			return;
		}

		await db.insert(interactiveLessonBlockState).values({
			id: nanoid(),
			sessionId: input.sessionId,
			blockId: input.blockId,
			scope,
			status: input.status,
			visitCount: shouldIncrementVisit ? 1 : 0,
			lastVisitId: input.lastVisitId ?? null,
			enteredAt:
				input.enteredAt ??
				(input.status === lessonBlockStateStatus.ACTIVE ||
				input.status === lessonBlockStateStatus.COMPLETED
					? now
					: null),
			completedAt:
				input.status === lessonBlockStateStatus.COMPLETED
					? (input.completedAt ?? now)
					: (input.completedAt ?? null),
			lastChoiceValue: input.lastChoiceValue ?? null,
			outputsJson: serializedOutputs ?? null,
			chatId: input.chatId ?? null,
			metadata: null,
			createdAt: now,
			updatedAt: now
		});
	}

	private static async createBlockVisit(input: {
		sessionId: string;
		blockId: string;
		scope?: InteractiveLessonSession['scope'];
		status?: InteractiveLessonBlockVisit['status'];
		outputs?: JsonRecord;
		lastChoiceValue?: string;
		chatId?: string;
		enteredAt?: Date;
		completedAt?: Date | null;
		metadata?: JsonRecord | null;
	}): Promise<InteractiveLessonBlockVisit> {
		const [visitStats] = await db
			.select({ maxVisit: max(interactiveLessonBlockVisit.visitNumber) })
			.from(interactiveLessonBlockVisit)
			.where(eq(interactiveLessonBlockVisit.sessionId, input.sessionId));
		const visitNumber = (visitStats?.maxVisit ?? 0) + 1;
		const now = input.enteredAt ?? new Date();
		const visitId = nanoid();
		const scope = input.scope ?? (await this.resolveSessionScope(input.sessionId));

		await db.insert(interactiveLessonBlockVisit).values({
			id: visitId,
			sessionId: input.sessionId,
			blockId: input.blockId,
			scope,
			visitNumber,
			status: input.status ?? lessonBlockVisitStatus.ACTIVE,
			enteredAt: now,
			completedAt: input.completedAt ?? null,
			lastChoiceValue: input.lastChoiceValue ?? null,
			outputsJson: input.outputs ? JSON.stringify(input.outputs) : null,
			chatId: input.chatId ?? null,
			metadata: input.metadata ? JSON.stringify(input.metadata) : null,
			createdAt: now,
			updatedAt: now
		});

		const createdVisit = await db
			.select()
			.from(interactiveLessonBlockVisit)
			.where(eq(interactiveLessonBlockVisit.id, visitId))
			.get();

		if (!createdVisit) {
			throw new LessonServiceError(500, 'No se pudo crear la visita del bloque.');
		}

		return createdVisit;
	}

	private static async updateBlockVisit(input: {
		visitId: string;
		status?: InteractiveLessonBlockVisit['status'];
		outputs?: JsonRecord;
		lastChoiceValue?: string;
		chatId?: string;
		completedAt?: Date | null;
		metadata?: JsonRecord | null;
	}): Promise<InteractiveLessonBlockVisit> {
		const existing = await db
			.select()
			.from(interactiveLessonBlockVisit)
			.where(eq(interactiveLessonBlockVisit.id, input.visitId))
			.get();

		if (!existing) {
			throw new LessonServiceError(404, 'Visita de bloque no encontrada.');
		}

		const now = new Date();
		const nextStatus = input.status ?? existing.status;
		const nextCompletedAt =
			input.completedAt !== undefined
				? input.completedAt
				: nextStatus === lessonBlockVisitStatus.COMPLETED ||
					  nextStatus === lessonBlockVisitStatus.SKIPPED ||
					  nextStatus === lessonBlockVisitStatus.ABANDONED
					? (existing.completedAt ?? now)
					: null;

		await db
			.update(interactiveLessonBlockVisit)
			.set({
				status: nextStatus,
				completedAt: nextCompletedAt,
				lastChoiceValue: input.lastChoiceValue ?? existing.lastChoiceValue,
				outputsJson: input.outputs ? JSON.stringify(input.outputs) : existing.outputsJson,
				chatId: input.chatId ?? existing.chatId,
				metadata: input.metadata ? JSON.stringify(input.metadata) : existing.metadata,
				updatedAt: now
			})
			.where(eq(interactiveLessonBlockVisit.id, input.visitId));

		const updatedVisit = await db
			.select()
			.from(interactiveLessonBlockVisit)
			.where(eq(interactiveLessonBlockVisit.id, input.visitId))
			.get();

		if (!updatedVisit) {
			throw new LessonServiceError(500, 'No se pudo actualizar la visita del bloque.');
		}

		return updatedVisit;
	}

	private static async loadBlockChatMessages(
		chatId: string
	): Promise<Array<{ id: string; type: string; content: string; createdAt: Date }>> {
		const records = await db
			.select()
			.from(message)
			.where(eq(message.chatId, chatId))
			.orderBy(message.createdAt)
			.all();

		return records.map((record) => ({
			id: record.id,
			type: record.type,
			content: record.content,
			createdAt: record.createdAt
		}));
	}

	private static async loadModelMessages(chatId: string): Promise<ModelMessage[]> {
		const records = await db
			.select()
			.from(message)
			.where(eq(message.chatId, chatId))
			.orderBy(message.createdAt)
			.all();

		return records.map((record) => ({
			role: toModelRole(record.type),
			content: record.content
		}));
	}

	private static countAgentConversationStats(
		messages: Array<Pick<ModelMessage, 'role'>>
	): AgentConversationStats {
		return messages.reduce(
			(stats, message) => {
				if (message.role === 'user') {
					stats.userTurns += 1;
					stats.userInteractionCount += 1;
				}
				if (message.role === 'assistant') stats.assistantTurns += 1;
				return stats;
			},
			{ userTurns: 0, assistantTurns: 0, uiResponseCount: 0, userInteractionCount: 0 }
		);
	}

	private static countVisibleAgentConversationStats(
		messages: AgentDisplayMessage[]
	): AgentConversationStats {
		return messages.reduce(
			(stats, message) => {
				if (message.role === 'user') {
					stats.userTurns += 1;
					stats.userInteractionCount += 1;
					return stats;
				}

				if (message.role !== 'assistant') {
					return stats;
				}

				stats.assistantTurns += 1;

				for (const part of message.parts) {
					if (part.kind === 'ui-component' && part.userResponse) {
						stats.uiResponseCount += 1;
						stats.userInteractionCount += 1;
					}
				}

				return stats;
			},
			{ userTurns: 0, assistantTurns: 0, uiResponseCount: 0, userInteractionCount: 0 }
		);
	}

	private static async getAgentConversationStats(
		chatId: string | null | undefined
	): Promise<AgentConversationStats> {
		if (!chatId) {
			return { userTurns: 0, assistantTurns: 0, uiResponseCount: 0, userInteractionCount: 0 };
		}

		const messages = await this.loadModelMessages(chatId);
		return this.countAgentConversationStats(messages);
	}

	private static async resolveLessonModel(block: LessonAgentBlock): Promise<string> {
		const configuredModel = block.agentConfig.model?.trim();
		if (configuredModel) {
			const availableModels = await AIUtils.getAvailableModels();
			if (availableModels.some((model) => model.name === configuredModel)) {
				return configuredModel;
			}
		}

		return AIUtils.getDefaultModel();
	}

	private static async logEvent(input: {
		interactiveLearningId: string;
		sessionId: string;
		userId: string;
		courseId: string;
		scope?: InteractiveLessonSession['scope'];
		visitId?: string | null;
		blockId?: string | null;
		eventType: (typeof lessonEventType)[keyof typeof lessonEventType];
		payload?: JsonRecord;
	}): Promise<void> {
		const scope = input.scope ?? (await this.resolveSessionScope(input.sessionId));
		await db.insert(interactiveLessonEvent).values({
			id: nanoid(),
			interactiveLearningId: input.interactiveLearningId,
			sessionId: input.sessionId,
			userId: input.userId,
			courseId: input.courseId,
			scope,
			visitId: input.visitId ?? null,
			blockId: input.blockId ?? null,
			eventType: input.eventType,
			payloadJson: input.payload ? JSON.stringify(input.payload) : null,
			createdAt: new Date()
		});
	}

	private static async resolveSessionScope(
		sessionId: string
	): Promise<InteractiveLessonSession['scope']> {
		const session = await db
			.select({ scope: interactiveLessonSession.scope })
			.from(interactiveLessonSession)
			.where(eq(interactiveLessonSession.id, sessionId))
			.get();

		if (!session) {
			throw new LessonServiceError(404, 'Sesión de lesson no encontrada.');
		}

		return session.scope;
	}

	private static buildTransitionGraph(definition: LessonDefinition): Map<string, string[]> {
		const graph = new Map<string, string[]>();
		for (const block of definition.blocks) {
			const targets = new Set<string>();
			if (block.next?.trim()) targets.add(block.next.trim());
			for (const branch of block.branches ?? []) {
				if (branch.targetBlockId?.trim()) targets.add(branch.targetBlockId.trim());
			}
			if (block.kind === 'choice') {
				for (const option of block.options) {
					if (option.targetBlockId?.trim()) targets.add(option.targetBlockId.trim());
				}
			}
			graph.set(block.id, [...targets]);
		}
		return graph;
	}

	private static buildIncomingTransitionGraph(definition: LessonDefinition): Map<string, string[]> {
		const graph = this.buildTransitionGraph(definition);
		const incoming = new Map<string, string[]>();

		for (const block of definition.blocks) {
			incoming.set(block.id, []);
		}

		for (const [source, targets] of graph.entries()) {
			for (const target of targets) {
				incoming.set(target, [...(incoming.get(target) ?? []), source]);
			}
		}

		return incoming;
	}

	private static createBlockTemplate(
		definition: LessonDefinition,
		kind: LessonBlockKind
	): LessonBlock {
		const existingIds = new Set(definition.blocks.map((block) => block.id));
		const baseId =
			kind === 'content'
				? 'content'
				: kind === 'choice'
					? 'choice'
					: kind === 'check'
						? 'check'
						: kind === 'agent'
							? 'agent'
							: kind === 'youtube'
								? 'youtube'
								: 'end';
		const blockId = this.createUniqueBlockId(baseId, existingIds);
		const defaultTarget =
			definition.blocks.find((block) => block.kind === 'end')?.id ??
			definition.entryBlockId ??
			definition.blocks[0]?.id;

		if (!defaultTarget && kind !== 'end') {
			throw new LessonServiceError(
				400,
				'No se ha encontrado un bloque de destino por defecto para el nuevo bloque.'
			);
		}

		if (kind === 'content') {
			return {
				id: blockId,
				kind,
				title: 'Nuevo contenido',
				body: '',
				continueLabel: 'Siguiente',
				next: defaultTarget ?? null,
				assetRefs: []
			};
		}

		if (kind === 'choice') {
			return {
				id: blockId,
				kind,
				title: 'Nueva decisión',
				body: '',
				outputKey: 'selection',
				options: [
					{
						id: 'option_1',
						label: 'Opción 1',
						value: 'option_1',
						description: '',
						targetBlockId: defaultTarget ?? ''
					}
				]
			};
		}

		if (kind === 'check') {
			return {
				id: blockId,
				kind,
				title: 'Nueva evaluación',
				body: '',
				next: defaultTarget ?? null,
				checkConfig: normalizeLessonCheckConfig({
					mode: 'single_choice',
					submitLabel: 'Enviar',
					retryLabel: 'Reintentar',
					continueLabel: 'Continuar',
					options: [
						{
							id: 'option_1',
							label: 'Opción 1',
							value: 'option_1',
							description: ''
						},
						{
							id: 'option_2',
							label: 'Opción 2',
							value: 'option_2',
							description: ''
						}
					],
					correctOptionIds: ['option_1']
				})
			};
		}

		if (kind === 'agent') {
			return {
				id: blockId,
				kind,
				title: 'Nuevo bloque IA',
				body: '',
				next: defaultTarget ?? null,
				requiresResponse: true,
				agentConfig: {
					runtimeMode: 'basic',
					interactionMode: 'single_turn',
					executionTrigger: 'on_user_submit',
					autoStartOnEnter: false,
					promptTemplate: '',
					systemPrompt: '',
					placeholder: 'Escribe tu respuesta',
					submitLabel: 'Enviar',
					continueLabel: 'Continuar',
					enabledToolIds: undefined,
					outputSchema: []
				}
			};
		}

		if (kind === 'youtube') {
			return {
				id: blockId,
				kind,
				title: 'Nuevo video YouTube',
				body: '',
				videoId: '',
				startSeconds: null,
				endSeconds: null,
				continueLabel: 'Continuar',
				pausePoints: [],
				next: defaultTarget ?? null
			};
		}

		return {
			id: blockId,
			kind,
			title: 'Bloque final',
			body: 'Has llegado al final de esta lección.',
			ctaLabel: 'Volver al curso'
		};
	}

	private static createUniqueBlockId(base: string, existingIds: Set<string>): string {
		const normalizedBase = base.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'block';
		let candidate = normalizedBase;
		let counter = 1;

		while (existingIds.has(candidate)) {
			candidate = `${normalizedBase}_${counter}`;
			counter += 1;
		}

		return candidate;
	}

	private static replaceBlockReferences(
		definition: LessonDefinition,
		fromBlockId: string,
		toBlockId: string
	): void {
		for (const block of definition.blocks) {
			if (block.next === fromBlockId) {
				block.next = toBlockId;
			}

			for (const branch of block.branches ?? []) {
				if (branch.targetBlockId === fromBlockId) {
					branch.targetBlockId = toBlockId;
				}
			}

			if (block.kind === 'choice') {
				for (const option of block.options) {
					if (option.targetBlockId === fromBlockId) {
						option.targetBlockId = toBlockId;
					}
				}
			}

			if (block.graph?.incomingOrder) {
				block.graph.incomingOrder = block.graph.incomingOrder.map((incomingBlockId) =>
					incomingBlockId === fromBlockId ? toBlockId : incomingBlockId
				);
			}
		}
	}

	private static removeBlockReferences(definition: LessonDefinition, blockId: string): void {
		for (const block of definition.blocks) {
			if (block.next === blockId) {
				block.next = null;
			}

			if (block.branches?.length) {
				block.branches = block.branches.filter((branch) => branch.targetBlockId !== blockId);
			}

			if (block.kind === 'choice') {
				block.options = block.options.map((option) =>
					option.targetBlockId === blockId ? { ...option, targetBlockId: '' } : option
				);
			}

			if (block.graph?.incomingOrder) {
				block.graph.incomingOrder = block.graph.incomingOrder.filter(
					(incomingBlockId) => incomingBlockId !== blockId
				);
			}
		}
	}

	private static contractFieldToVariable(
		field: LessonBlockContractField,
		blockId: string
	): LessonAvailableVariable {
		return {
			path: field.path,
			label: field.label,
			description: field.description,
			namespace: field.namespace,
			blockId,
			source: field.namespace === 'state' ? 'block-state' : 'block-output'
		};
	}

	private static buildBlockContract(block: LessonBlock): LessonBlockContract {
		const state: LessonBlockContractField[] = [
			{
				path: `blocks.${block.id}.state.status`,
				key: 'status',
				label: `${block.title} · estado`,
				description: 'Estado resumido de la última visita registrada.',
				type: 'status',
				source: 'system',
				namespace: 'state',
				availableWhen: 'after_visit'
			},
			{
				path: `blocks.${block.id}.state.visitCount`,
				key: 'visitCount',
				label: `${block.title} · visitas`,
				description: 'Número de visitas registradas para este bloque en la sesión.',
				type: 'integer',
				source: 'system',
				namespace: 'state',
				availableWhen: 'after_visit'
			},
			{
				path: `blocks.${block.id}.state.enteredAt`,
				key: 'enteredAt',
				label: `${block.title} · entrada`,
				description: 'Fecha/hora ISO de la última entrada al bloque.',
				type: 'date',
				source: 'system',
				namespace: 'state',
				availableWhen: 'after_visit'
			},
			{
				path: `blocks.${block.id}.state.completedAt`,
				key: 'completedAt',
				label: `${block.title} · completado`,
				description: 'Fecha/hora ISO de la última completitud registrada.',
				type: 'date',
				source: 'system',
				namespace: 'state',
				availableWhen: 'after_completion'
			},
			{
				path: `blocks.${block.id}.state.available`,
				key: 'available',
				label: `${block.title} · disponible`,
				description: 'Indica si este bloque ya tiene una visita persistida en la sesión.',
				type: 'boolean',
				source: 'system',
				namespace: 'state',
				availableWhen: 'always'
			},
			{
				path: `blocks.${block.id}.state.lastVisitId`,
				key: 'lastVisitId',
				label: `${block.title} · última visita`,
				description: 'Identificador de la última visita registrada.',
				type: 'string',
				source: 'system',
				namespace: 'state',
				availableWhen: 'after_visit'
			}
		];

		const outputs: LessonBlockContractField[] = [];

		if (block.kind === 'content') {
			outputs.push(
				{
					path: `blocks.${block.id}.outputs.visited`,
					key: 'visited',
					label: `${block.title} · visitado`,
					description: 'Booleano derivado para saber si el bloque ya fue visitado.',
					type: 'boolean',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'always'
				},
				{
					path: `blocks.${block.id}.outputs.completed`,
					key: 'completed',
					label: `${block.title} · completado`,
					description: 'Booleano derivado para saber si la última visita quedó completada.',
					type: 'boolean',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'always'
				}
			);
		}

		if (block.kind === 'choice') {
			const outputKey = block.outputKey || 'selection';
			outputs.push(
				{
					path: `blocks.${block.id}.outputs.${outputKey}`,
					key: outputKey,
					label: `${block.title} · selección`,
					description: 'Valor elegido por el estudiante en la última visita.',
					type: 'string',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'after_completion'
				},
				{
					path: `blocks.${block.id}.outputs.selectedValue`,
					key: 'selectedValue',
					label: `${block.title} · valor`,
					description: 'Valor bruto elegido por el estudiante.',
					type: 'string',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'after_completion'
				},
				{
					path: `blocks.${block.id}.outputs.selectedLabel`,
					key: 'selectedLabel',
					label: `${block.title} · etiqueta`,
					description: 'Etiqueta visible elegida por el estudiante.',
					type: 'string',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'after_completion'
				},
				{
					path: `blocks.${block.id}.outputs.optionId`,
					key: 'optionId',
					label: `${block.title} · opción`,
					description: 'ID técnico de la opción elegida.',
					type: 'string',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'after_completion'
				}
			);
		}

		if (block.kind === 'agent') {
			outputs.push(
				{
					path: `blocks.${block.id}.outputs.response`,
					key: 'response',
					label: `${block.title} · respuesta`,
					description: 'Última respuesta generada por la IA en este bloque.',
					type: 'string',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'after_completion'
				},
				{
					path: `blocks.${block.id}.outputs.lastUserMessage`,
					key: 'lastUserMessage',
					label: `${block.title} · entrada`,
					description: 'Última aportación del alumno en este bloque.',
					type: 'string',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'after_visit'
				},
				{
					path: `blocks.${block.id}.outputs.interactionMode`,
					key: 'interactionMode',
					label: `${block.title} · interaccion`,
					description: 'Modo de interacción configurado para este bloque IA.',
					type: 'string',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'always'
				},
				{
					path: `blocks.${block.id}.outputs.executionTrigger`,
					key: 'executionTrigger',
					label: `${block.title} · disparo`,
					description: 'Momento en el que se ejecuta el bloque IA.',
					type: 'string',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'always'
				},
				{
					path: `blocks.${block.id}.outputs.autoStartOnEnter`,
					key: 'autoStartOnEnter',
					label: `${block.title} · autoarranque`,
					description: 'Indica si el bloque IA se inicia automáticamente al entrar.',
					type: 'boolean',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'always'
				},
				{
					path: `blocks.${block.id}.outputs.hasUserResponse`,
					key: 'hasUserResponse',
					label: `${block.title} · respondió el alumno`,
					description: 'Indica si ya existe al menos una intervención del alumno en este bloque.',
					type: 'boolean',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'after_visit'
				},
				{
					path: `blocks.${block.id}.outputs.userTurnCount`,
					key: 'userTurnCount',
					label: `${block.title} · turnos del alumno`,
					description: 'Número de mensajes enviados por el alumno en este bloque.',
					type: 'number',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'after_visit'
				},
				{
					path: `blocks.${block.id}.outputs.assistantTurnCount`,
					key: 'assistantTurnCount',
					label: `${block.title} · turnos IA`,
					description: 'Número de mensajes visibles emitidos por la IA en este bloque.',
					type: 'number',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'after_visit'
				},
				{
					path: `blocks.${block.id}.outputs.autoStarted`,
					key: 'autoStarted',
					label: `${block.title} · autoarrancado`,
					description: 'Indica si esta visita ya ejecutó el arranque automático del bloque.',
					type: 'boolean',
					source: 'system',
					namespace: 'outputs',
					availableWhen: 'after_visit'
				}
			);
		}

		if (block.kind === 'end') {
			outputs.push({
				path: `blocks.${block.id}.outputs.completed`,
				key: 'completed',
				label: `${block.title} · final alcanzado`,
				description: 'Indica si esta sesión llegó a este nodo final.',
				type: 'boolean',
				source: 'system',
				namespace: 'outputs',
				availableWhen: 'after_completion'
			});
		}

		const publicOutputFields = new Map<string, LessonOutputField>();

		for (const field of block.exposure?.outputs ?? []) {
			publicOutputFields.set(field.key, field);
		}

		if (block.kind === 'agent') {
			for (const field of block.agentConfig.outputSchema ?? []) {
				publicOutputFields.set(field.key, field);
			}
		}

		for (const field of publicOutputFields.values()) {
			if (outputs.some((candidate) => candidate.key === field.key)) continue;
			outputs.push({
				path: `blocks.${block.id}.outputs.${field.key}`,
				key: field.key,
				label: `${block.title} · ${field.key}`,
				description: field.description || 'Salida pública disponible para otros bloques.',
				type: field.type,
				source: 'public',
				namespace: 'outputs',
				availableWhen: 'after_completion'
			});
		}

		return {
			blockId: block.id,
			blockTitle: block.title,
			blockKind: block.kind,
			state,
			outputs
		};
	}

	private static findIncomingReferences(definition: LessonDefinition, blockId: string): string[] {
		const references: string[] = [];

		for (const block of definition.blocks) {
			if (block.id === blockId) continue;

			if (block.next === blockId) {
				references.push(`${block.id}.next`);
			}

			for (const [branchIndex, branch] of (block.branches ?? []).entries()) {
				if (branch.targetBlockId === blockId) {
					references.push(`${block.id}.branches[${branchIndex}]`);
				}
			}

			if (block.kind === 'choice') {
				for (const option of block.options) {
					if (option.targetBlockId === blockId) {
						references.push(`${block.id}.options.${option.id}`);
					}
				}
			}

			for (const ref of this.extractBlockReferences(block)) {
				if (ref.startsWith(`blocks.${blockId}.`)) {
					references.push(`${block.id}.ref:${ref}`);
				}
			}
		}

		return references;
	}

	private static assertBlockConfiguration(block: LessonBlock): void {
		if (!block.id?.trim()) {
			throw new LessonServiceError(400, 'Todos los bloques deben tener un ID.');
		}

		if (!block.title?.trim()) {
			throw new LessonServiceError(400, `El bloque "${block.id}" debe tener un título.`);
		}

		for (const branch of block.branches ?? []) {
			const parsedBranch = lessonTransitionSchema.safeParse(branch);
			if (!parsedBranch.success) {
				throw new LessonServiceError(
					400,
					`Una de las ramas del bloque "${block.id}" no tiene el formato esperado.`
				);
			}

			if (!branch.targetBlockId.trim()) {
				throw new LessonServiceError(
					400,
					`Una rama del bloque "${block.id}" no tiene bloque de destino.`
				);
			}

			if (branch.condition && !branch.condition.source.trim()) {
				throw new LessonServiceError(
					400,
					`Una rama del bloque "${block.id}" necesita una fuente válida en la condición.`
				);
			}
		}

		if (block.kind === 'content') {
			for (const asset of block.assetRefs ?? []) {
				if (!asset.fileId?.trim()) {
					throw new LessonServiceError(
						400,
						`El bloque de contenido "${block.id}" tiene un recurso sin archivo asociado.`
					);
				}
			}
		}

		if (block.kind === 'choice') {
			if (block.options.length === 0) {
				throw new LessonServiceError(
					400,
					`El bloque de elección "${block.id}" debe tener al menos una opción.`
				);
			}

			const duplicatedOptionIds = block.options
				.map((option) => option.id)
				.filter((id, index, list) => list.indexOf(id) !== index);
			if (duplicatedOptionIds.length > 0) {
				throw new LessonServiceError(
					400,
					`El bloque de elección "${block.id}" tiene opciones duplicadas: ${[
						...new Set(duplicatedOptionIds)
					].join(', ')}.`
				);
			}

			for (const option of block.options) {
				if (!option.id?.trim()) {
					throw new LessonServiceError(
						400,
						`El bloque de elección "${block.id}" tiene una opción sin ID.`
					);
				}

				if (!option.label?.trim()) {
					throw new LessonServiceError(
						400,
						`La opción "${option.id}" del bloque "${block.id}" necesita una etiqueta.`
					);
				}

				if (!option.targetBlockId?.trim()) {
					throw new LessonServiceError(
						400,
						`La opción "${option.id}" del bloque "${block.id}" no tiene bloque de destino.`
					);
				}
			}
		}

		if (block.kind === 'agent') {
			const normalizedAgentConfig = normalizeLessonAgentConfig(block.agentConfig);
			if (normalizedAgentConfig.interactionMode === 'none' && (block.requiresResponse ?? false)) {
				throw new LessonServiceError(
					400,
					`El bloque IA "${block.id}" no puede exigir respuesta del alumno si no admite interacción.`
				);
			}
		}
	}

	private static assertTransitionTargets(
		definition: LessonDefinition,
		blockMap: Map<string, LessonBlock>
	): void {
		for (const block of definition.blocks) {
			if (block.next !== undefined && block.next !== null) {
				const normalizedNext = block.next.trim();
				if (!normalizedNext) {
					throw new LessonServiceError(
						400,
						`El bloque "${block.id}" tiene un siguiente bloque vacío.`
					);
				}

				if (!blockMap.has(normalizedNext)) {
					throw new LessonServiceError(
						400,
						`El bloque "${block.id}" apunta a un bloque inexistente: "${normalizedNext}".`
					);
				}
			}

			for (const branch of block.branches ?? []) {
				const normalizedTarget = branch.targetBlockId.trim();
				if (!blockMap.has(normalizedTarget)) {
					throw new LessonServiceError(
						400,
						`Una rama del bloque "${block.id}" apunta a un bloque inexistente: "${normalizedTarget}".`
					);
				}
			}

			if (block.kind !== 'choice') continue;

			for (const option of block.options) {
				const normalizedTarget = option.targetBlockId.trim();
				if (!blockMap.has(normalizedTarget)) {
					throw new LessonServiceError(
						400,
						`La opción "${option.id}" del bloque "${block.id}" apunta a un bloque inexistente: "${normalizedTarget}".`
					);
				}
			}
		}
	}

	private static extractBlockReferences(block: LessonBlock): Set<string> {
		const refs = new Set<string>([
			...extractTemplateRefs((block as { body?: string }).body),
			...(block.kind === 'agent'
				? [
						...extractTemplateRefs(block.agentConfig.promptTemplate),
						...extractTemplateRefs(block.agentConfig.systemPrompt),
						...extractTemplateRefs(block.agentConfig.initialAssistantMessage),
						...extractTemplateRefs(block.agentConfig.launchMessageTemplate)
					]
				: []),
			...(block.kind === 'choice'
				? block.options.flatMap((option) => [
						...extractTemplateRefs(option.label),
						...extractTemplateRefs(option.description)
					])
				: []),
			...(block.kind === 'check'
				? [
						...extractTemplateRefs(block.checkConfig.submitLabel),
						...extractTemplateRefs(block.checkConfig.continueLabel),
						...extractTemplateRefs(block.checkConfig.retryLabel),
						...extractTemplateRefs(block.checkConfig.feedbackCorrect),
						...extractTemplateRefs(block.checkConfig.feedbackIncorrect),
						...extractTemplateRefs(block.checkConfig.feedbackPartial),
						...block.checkConfig.options.flatMap((option) => [
							...extractTemplateRefs(option.label),
							...extractTemplateRefs(option.description)
						])
					]
				: []),
			...(block.kind === 'youtube'
				? [
						...extractTemplateRefs(block.continueLabel),
						...(block.pausePoints ?? []).flatMap((pausePoint) => [
							...extractTemplateRefs(pausePoint.title),
							...extractTemplateRefs(pausePoint.body),
							...extractTemplateRefs(pausePoint.resumeLabel)
						])
					]
				: []),
			...(block.kind === 'content' ? extractTemplateRefs(block.continueLabel) : []),
			...(block.kind === 'end' ? extractTemplateRefs(block.ctaLabel) : [])
		]);

		for (const branch of block.branches ?? []) {
			if (branch.condition?.source) refs.add(branch.condition.source);
			if (branch.label) {
				for (const ref of extractTemplateRefs(branch.label)) refs.add(ref);
			}
		}

		return refs;
	}

	private static assertTemplateReferences(definition: LessonDefinition): void {
		const blockMap = new Map(definition.blocks.map((block) => [block.id, block]));
		for (const block of definition.blocks) {
			const refs = this.extractBlockReferences(block);
			for (const ref of refs) {
				if (ref.startsWith('session.')) continue;
				if (!ref.startsWith('blocks.')) {
					throw new LessonServiceError(
						400,
						`La referencia "${ref}" del bloque "${block.id}" no usa un formato soportado.`
					);
				}
				const [, sourceBlockId, scope] = ref.split('.');
				if (!sourceBlockId || (scope !== 'outputs' && scope !== 'state')) {
					throw new LessonServiceError(
						400,
						`La referencia "${ref}" del bloque "${block.id}" debe apuntar a state u outputs.`
					);
				}
				if (!blockMap.has(sourceBlockId)) {
					throw new LessonServiceError(
						400,
						`La referencia "${ref}" del bloque "${block.id}" apunta a un bloque inexistente.`
					);
				}
			}
		}
	}

	private static isStaff(role: string | undefined): boolean {
		if (!role) return false;
		return CourseInteractiveAuthUtils.STAFF_ROLES.includes(
			role as (typeof CourseInteractiveAuthUtils.STAFF_ROLES)[number]
		);
	}
}
