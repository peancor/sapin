import type { ModelMessage } from 'ai';
import { AIUtils } from '$lib/server/ai/AIUtils';
import { db, CourseInteractiveAuthUtils, InteractiveChatAuthUtils } from '$lib/server/db';
import { markActivityCompleted, markActivityInProgress } from '$lib/server/db/ProgressWriteUtils';
import {
	chat,
	courseInteractiveLearning,
	interactiveLearning,
	interactiveLearningFile,
	interactiveLearningLesson,
	interactiveLessonBlockState,
	interactiveLessonBlockVisit,
	interactiveLessonEvent,
	interactiveLessonSession,
	lessonAttemptStatus,
	lessonBlockStateStatus,
	lessonBlockVisitStatus,
	lessonEventType,
	message
} from '$lib/server/db/schema';
import type {
	InteractiveLearning,
	InteractiveLearningFile,
	InteractiveLearningLesson,
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
	LessonBlockKind,
	LessonConditionOperator,
	LessonDefinition,
	LessonOutputField,
	LessonTransition
} from '$lib/types/lesson';
import { isLessonAgentInteractive } from '$lib/types/lesson';
import { and, desc, eq, max } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { LessonServiceError } from './LessonServiceError';
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
	definition: LessonDefinition;
	session: InteractiveLessonSession;
	blockStates: InteractiveLessonBlockState[];
	blockVisits: InteractiveLessonBlockVisit[];
	currentBlock: LessonBlock;
	resolvedCurrentBlock: LessonBlock;
	currentBlockState: InteractiveLessonBlockState | null;
	currentVisit: InteractiveLessonBlockVisit | null;
	currentAssets: LessonResolvedAsset[];
	currentChatMessages: Array<{ id: string; type: string; content: string; createdAt: Date }>;
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

function coerceOutputValue(raw: unknown, field: LessonOutputField): unknown {
	if (raw === undefined || raw === null) return null;
	if (field.type === 'number') return typeof raw === 'number' ? raw : Number(raw);
	if (field.type === 'boolean')
		return typeof raw === 'boolean' ? raw : String(raw).toLowerCase() === 'true';
	if (field.type === 'string') return String(raw);
	return raw;
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

	static setEntryBlock(definition: LessonDefinition, blockId: string): LessonDefinition {
		if (!definition.blocks.some((block) => block.id === blockId)) {
			throw new LessonServiceError(404, `El bloque "${blockId}" no existe.`);
		}

		return this.validateDefinition({
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

		const activityData = await this.getLessonActivity(input.interactiveLearningId);
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
					eq(interactiveLessonSession.courseId, courseId)
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
			entryBlockId: this.parseDefinition(activityData.activity.content).entryBlockId
		});
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
		const activeSession = refreshedSession ?? session;

		const activityData = await this.getLessonActivity(activeSession.interactiveLearningId);
		const definition = this.parseDefinition(activityData.activity.content);
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
			activityData.activity.status === 'closed' ||
			activeSession.status === lessonAttemptStatus.COMPLETED;
		const availableReferenceGroups = this.getAvailableReferenceGroups(definition);
		const currentBlockContract = buildLessonBlockContract(currentBlock);
		const currentChatId = currentVisit?.chatId ?? currentBlockState?.chatId ?? null;

		if (
			!input.skipAutoAgentExecution &&
			currentBlock.kind === 'agent' &&
			!isReadOnly &&
			this.shouldAutoExecuteAgentBlock(currentBlock)
		) {
			const currentOutputs = normalizeOutputs(
				currentVisit?.outputsJson ?? currentBlockState?.outputsJson
			);

			if (!currentOutputs.response) {
				await this.executeAgentOnEnter({
					activity: activityData.activity,
					definition,
					session: activeSession,
					currentBlock,
					resolvedCurrentBlock,
					currentBlockState,
					currentVisit,
					blockStates,
					blockVisits,
					currentAssets,
					currentChatMessages: [],
					files,
					filesById,
					availableVariables: [],
					availableReferenceGroups,
					currentBlockContract,
					currentVisitId: activeSession.currentVisitId ?? currentVisit?.id ?? null,
					canRestart:
						activityData.lesson.allowRestart &&
						activeSession.userId === input.userId &&
						activityData.activity.status === 'published',
					canInteract: true,
					isReadOnly: false,
					lesson: activityData.lesson
				});

				return this.getSessionView({
					...input,
					skipAutoAgentExecution: true
				});
			}
		}

		const currentChatMessages =
			currentBlock.kind === 'agent' && currentChatId
				? await this.loadBlockChatMessages(currentChatId)
				: [];

		return {
			activity: activityData.activity,
			lesson: activityData.lesson,
			definition,
			session: activeSession,
			blockStates,
			blockVisits,
			currentBlock,
			resolvedCurrentBlock,
			currentBlockState,
			currentVisit,
			currentAssets,
			currentChatMessages,
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
				activityData.activity.status === 'published',
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
			view.currentBlock.kind === 'agent' &&
			(view.currentBlock.requiresResponse ?? true) &&
			!normalizeOutputs(view.currentVisit?.outputsJson ?? view.currentBlockState?.outputsJson)
				.response
		) {
			throw new LessonServiceError(
				400,
				'Este bloque IA necesita al menos una respuesta antes de continuar.'
			);
		}

		return this.completeBlockAndEnterNext(
			view,
			normalizeOutputs(view.currentVisit?.outputsJson ?? view.currentBlockState?.outputsJson)
		);
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
		const userMessage = input.message.trim();
		if (!userMessage) {
			throw new LessonServiceError(400, 'El mensaje no puede estar vacío.');
		}

		const view = await this.getSessionView(input);

		if (!view.canInteract) {
			throw new LessonServiceError(403, 'La sesión está en modo solo lectura.');
		}

		if (view.currentBlock.id !== input.blockId || view.currentBlock.kind !== 'agent') {
			throw new LessonServiceError(409, 'El bloque activo no es un bloque IA.');
		}

		if (
			view.currentBlock.agentConfig.executionTrigger !== 'on_user_submit' ||
			!isLessonAgentInteractive(view.currentBlock.agentConfig)
		) {
			throw new LessonServiceError(
				400,
				'Este bloque IA se ejecuta automaticamente y no admite mensajes manuales.'
			);
		}

		const currentOutputs = normalizeOutputs(
			view.currentVisit?.outputsJson ?? view.currentBlockState?.outputsJson
		);
		if (
			view.currentBlock.agentConfig.interactionMode === 'single_turn' &&
			currentOutputs.response &&
			(view.currentVisit?.chatId || view.currentBlockState?.chatId)
		) {
			throw new LessonServiceError(
				400,
				'Este bloque de respuesta guiada ya recibió una respuesta. Pulsa continuar para seguir.'
			);
		}

		const blockState = await this.ensureAgentBlockChat(view);
		const modelName = await this.resolveLessonModel(view.currentBlock);
		const maxTurns = view.currentBlock.agentConfig.maxTurns ?? null;

		if (maxTurns && blockState.chatId) {
			const records = await db
				.select()
				.from(message)
				.where(eq(message.chatId, blockState.chatId))
				.all();
			const userTurns = records.filter((item) => item.type === 'USER').length;
			if (userTurns >= maxTurns) {
				throw new LessonServiceError(400, 'Este bloque ya alcanzó el máximo de turnos permitidos.');
			}
		}

		await AIUtils.saveMessage(blockState.chatId!, userMessage, 'USER');
		const aiMessages = await this.loadModelMessages(blockState.chatId!);
		const assistantMessage = await AIUtils.generateTextFromMessages(aiMessages, modelName, {
			userId: view.session.userId,
			courseId: view.session.courseId,
			interactiveLearningId: view.activity.id,
			chatId: blockState.chatId!
		});
		await AIUtils.saveMessage(blockState.chatId!, assistantMessage, 'ASSISTANT');

		const updatedModelMessages = [
			...aiMessages,
			{ role: 'assistant' as const, content: assistantMessage }
		];
		const extractedOutputs = await this.extractAgentOutputs({
			block: view.currentBlock,
			modelName,
			assistantMessage,
			userMessage,
			messages: updatedModelMessages,
			context: {
				userId: view.session.userId,
				courseId: view.session.courseId,
				interactiveLearningId: view.activity.id,
				chatId: blockState.chatId!
			}
		});

		const outputs = {
			...currentOutputs,
			...extractedOutputs
		};

		await this.updateBlockVisit({
			visitId: blockState.id,
			status: lessonBlockVisitStatus.ACTIVE,
			outputs,
			chatId: blockState.chatId!
		});

		await this.upsertBlockState({
			sessionId: view.session.id,
			blockId: view.currentBlock.id,
			status: lessonBlockStateStatus.ACTIVE,
			outputs,
			chatId: blockState.chatId!,
			lastVisitId: blockState.id
		});

		await markActivityInProgress({
			userId: view.session.userId,
			courseId: view.session.courseId,
			activityId: view.activity.id,
			activityType: 'lesson',
			source: 'lesson:agent-turn'
		});

		return {
			session: view.session,
			assistantMessage,
			outputs
		};
	}

	private static async createSession(input: {
		interactiveLearningId: string;
		userId: string;
		courseId: string;
		entryBlockId: string;
	}): Promise<InteractiveLessonSession> {
		const [attemptStats] = await db
			.select({ maxAttempt: max(interactiveLessonSession.attemptNumber) })
			.from(interactiveLessonSession)
			.where(
				and(
					eq(interactiveLessonSession.interactiveLearningId, input.interactiveLearningId),
					eq(interactiveLessonSession.userId, input.userId),
					eq(interactiveLessonSession.courseId, input.courseId)
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

		await markActivityInProgress({
			userId: input.userId,
			courseId: input.courseId,
			activityId: input.interactiveLearningId,
			activityType: 'lesson',
			source: 'lesson:create-session'
		});

		const activityData = await this.getLessonActivity(input.interactiveLearningId);
		const definition = this.parseDefinition(activityData.activity.content);

		return this.enterBlock(
			{
				id: sessionId,
				interactiveLearningId: input.interactiveLearningId,
				userId: input.userId,
				courseId: input.courseId,
				attemptNumber,
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
			definition
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

			await markActivityCompleted({
				userId: session.userId,
				courseId: session.courseId,
				activityId: activity.id,
				activityType: 'lesson',
				source: 'lesson:end-block'
			});
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

		if (baseSystemPrompt) {
			await AIUtils.saveMessage(chatId, baseSystemPrompt, 'SYSTEM');
		}

		if (
			isLessonAgentInteractive(resolvedBlock.agentConfig) &&
			resolvedBlock.agentConfig.initialAssistantMessage?.trim()
		) {
			await AIUtils.saveMessage(
				chatId,
				resolvedBlock.agentConfig.initialAssistantMessage.trim(),
				'ASSISTANT'
			);
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

	private static async extractAgentOutputs(input: {
		block: LessonAgentBlock;
		modelName: string;
		assistantMessage: string;
		userMessage: string;
		messages: ModelMessage[];
		context: {
			userId?: string;
			courseId?: string;
			interactiveLearningId?: string;
			chatId?: string;
		};
	}): Promise<JsonRecord> {
		const baseOutputs: JsonRecord = {
			response: input.assistantMessage,
			lastUserMessage: input.userMessage,
			interactionMode: input.block.agentConfig.interactionMode,
			executionTrigger: input.block.agentConfig.executionTrigger
		};
		const outputSchema = input.block.agentConfig.outputSchema ?? [];

		if (outputSchema.length === 0) {
			return baseOutputs;
		}

		const transcript = input.messages
			.map((message) => `${message.role.toUpperCase()}: ${String(message.content)}`)
			.join('\n\n');
		const schemaDescription = outputSchema
			.map((field) => `- ${field.key} (${field.type}): ${field.description || 'Sin descripción.'}`)
			.join('\n');

		try {
			const extractionPrompt = [
				'Eres un extractor de datos para una lesson basada en grafo.',
				'Devuelve exclusivamente un objeto JSON válido que siga este esquema:',
				schemaDescription,
				'Conversación:',
				transcript
			].join('\n\n');
			const extractedText = await AIUtils.generateText(
				extractionPrompt,
				input.modelName,
				input.context
			);
			const parsed = safeJsonParse<JsonRecord>(this.extractJsonObject(extractedText), {});
			for (const field of outputSchema) {
				baseOutputs[field.key] = coerceOutputValue(parsed[field.key], field);
			}
		} catch (error) {
			console.warn('[LessonService] No se pudo extraer salida estructurada', error);
		}

		return baseOutputs;
	}

	private static extractJsonObject(raw: string): string {
		const firstBrace = raw.indexOf('{');
		const lastBrace = raw.lastIndexOf('}');
		if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return '{}';
		return raw.slice(firstBrace, lastBrace + 1);
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
		return (
			block.agentConfig.interactionMode === 'none' &&
			block.agentConfig.executionTrigger === 'on_enter'
		);
	}

	private static async executeAgentOnEnter(view: LessonSessionView): Promise<void> {
		if (view.currentBlock.kind !== 'agent' || view.resolvedCurrentBlock.kind !== 'agent') {
			throw new LessonServiceError(400, 'El bloque activo no admite ejecucion automatica.');
		}

		if (!view.currentVisit) {
			throw new LessonServiceError(409, 'No se pudo resolver la visita activa del bloque IA.');
		}

		const currentOutputs = normalizeOutputs(
			view.currentVisit.outputsJson ?? view.currentBlockState?.outputsJson
		);
		if (currentOutputs.response) {
			return;
		}

		const blockVisit = await this.ensureAgentBlockChat(view);
		const modelName = await this.resolveLessonModel(view.currentBlock);
		const launchMessage = await this.buildAutoAgentLaunchMessage(view);
		const baseMessages = await this.loadModelMessages(blockVisit.chatId!);
		const assistantMessage = await AIUtils.generateTextFromMessages(
			[...baseMessages, { role: 'user' as const, content: launchMessage }],
			modelName,
			{
				userId: view.session.userId,
				courseId: view.session.courseId,
				interactiveLearningId: view.activity.id,
				chatId: blockVisit.chatId!
			}
		);

		await AIUtils.saveMessage(blockVisit.chatId!, assistantMessage, 'ASSISTANT');

		const extractedOutputs = await this.extractAgentOutputs({
			block: view.currentBlock,
			modelName,
			assistantMessage,
			userMessage: '',
			messages: [...baseMessages, { role: 'assistant' as const, content: assistantMessage }],
			context: {
				userId: view.session.userId,
				courseId: view.session.courseId,
				interactiveLearningId: view.activity.id,
				chatId: blockVisit.chatId!
			}
		});
		const outputs = {
			...currentOutputs,
			...extractedOutputs
		};

		await this.updateBlockVisit({
			visitId: blockVisit.id,
			status: lessonBlockVisitStatus.ACTIVE,
			outputs,
			chatId: blockVisit.chatId!
		});

		await this.upsertBlockState({
			sessionId: view.session.id,
			blockId: view.currentBlock.id,
			status: lessonBlockStateStatus.ACTIVE,
			outputs,
			chatId: blockVisit.chatId!,
			lastVisitId: blockVisit.id
		});
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
			.join('\n\n');
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
				const selectedLabel = outputs.selectedLabel ?? outputs.selectedValue ?? visit.lastChoiceValue;
				sections.push(
					`${heading}\nSeleccion: ${selectedLabel || 'Sin seleccion registrada.'}`
				);
				continue;
			}

			if (resolvedBlock.kind === 'agent') {
				const visibleMessages = visit.chatId
					? (await this.loadBlockChatMessages(visit.chatId)).filter(
							(message) => message.type !== 'SYSTEM'
						)
					: [];
				const transcript =
					visibleMessages.length > 0
						? visibleMessages
								.map((message) => {
									const role =
										message.type === 'USER'
											? 'Alumno'
											: message.type === 'ASSISTANT'
												? 'IA'
												: 'Sistema';
									return `${role}: ${message.content}`;
								})
								.join('\n\n')
						: outputs.response
							? `IA: ${String(outputs.response)}`
							: 'Sin transcript visible.';

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

		if (block.kind === 'content') {
			return {
				...block,
				title: this.resolveStringTemplate(block.title, context),
				body: this.resolveStringTemplate(block.body, context),
				continueLabel: this.resolveStringTemplate(block.continueLabel || '', context)
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
		status: string;
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
		const serializedOutputs = input.outputs ? JSON.stringify(input.outputs) : undefined;
		const shouldIncrementVisit = Boolean(input.incrementVisitCount);

		if (existing) {
			await db
				.update(interactiveLessonBlockState)
				.set({
					status: input.status as any,
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
			status: input.status as any,
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
		status?: string;
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

		await db.insert(interactiveLessonBlockVisit).values({
			id: visitId,
			sessionId: input.sessionId,
			blockId: input.blockId,
			visitNumber,
			status: (input.status ?? lessonBlockVisitStatus.ACTIVE) as any,
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
		status?: string;
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
				status: nextStatus as any,
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
		visitId?: string | null;
		blockId?: string | null;
		eventType: string;
		payload?: JsonRecord;
	}): Promise<void> {
		await db.insert(interactiveLessonEvent).values({
			id: nanoid(),
			interactiveLearningId: input.interactiveLearningId,
			sessionId: input.sessionId,
			userId: input.userId,
			courseId: input.courseId,
			visitId: input.visitId ?? null,
			blockId: input.blockId ?? null,
			eventType: input.eventType as any,
			payloadJson: input.payload ? JSON.stringify(input.payload) : null,
			createdAt: new Date()
		});
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
					: kind === 'agent'
						? 'agent'
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

		if (kind === 'agent') {
			return {
				id: blockId,
				kind,
				title: 'Nuevo bloque IA',
				body: '',
				next: defaultTarget ?? null,
				requiresResponse: true,
				agentConfig: {
					interactionMode: 'single_turn',
					executionTrigger: 'on_user_submit',
					promptTemplate: '',
					systemPrompt: '',
					placeholder: 'Escribe tu respuesta',
					submitLabel: 'Enviar',
					continueLabel: 'Continuar',
					outputSchema: []
				}
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
