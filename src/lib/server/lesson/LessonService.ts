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
	interactiveLessonEvent,
	interactiveLessonSession,
	lessonAttemptStatus,
	lessonBlockStateStatus,
	lessonEventType,
	message
} from '$lib/server/db/schema';
import type {
	InteractiveLearning,
	InteractiveLearningFile,
	InteractiveLearningLesson,
	InteractiveLessonBlockState,
	InteractiveLessonSession
} from '$lib/server/db/schema';
import type {
	LessonAgentBlock,
	LessonAvailableVariable,
	LessonBlock,
	LessonConditionOperator,
	LessonDefinition,
	LessonOutputField,
	LessonTransition
} from '$lib/types/lesson';
import { and, desc, eq, max } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';

type JsonRecord = Record<string, unknown>;

export class LessonServiceError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = 'LessonServiceError';
		this.status = status;
	}
}

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

const lessonOutputFieldSchema = z.object({
	key: z.string().min(1).regex(/^[a-zA-Z0-9_.-]+$/),
	type: z.enum(['string', 'number', 'boolean', 'json']),
	description: z.string().optional()
});

const lessonDefinitionSchema = z.object({
	version: z.literal('1'),
	entryBlockId: z.string().min(1),
	blocks: z.array(z.any()).min(1)
});

const DEFAULT_LESSON_DEFINITION: LessonDefinition = {
	version: '1',
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
	currentBlock: LessonBlock;
	resolvedCurrentBlock: LessonBlock;
	currentBlockState: InteractiveLessonBlockState | null;
	currentAssets: LessonResolvedAsset[];
	currentChatMessages: Array<{ id: string; type: string; content: string; createdAt: Date }>;
	files: InteractiveLearningFile[];
	filesById: Record<string, InteractiveLearningFile>;
	availableVariables: LessonAvailableVariable[];
	canRestart: boolean;
	canInteract: boolean;
	isReadOnly: boolean;
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
	if (field.type === 'boolean') return typeof raw === 'boolean' ? raw : String(raw).toLowerCase() === 'true';
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
		let parsed: unknown;

		try {
			parsed = JSON.parse(content);
		} catch {
			throw new LessonServiceError(400, 'La definición JSON de la lesson no es válida.');
		}

		const parseResult = lessonDefinitionSchema.safeParse(parsed);
		if (!parseResult.success) {
			throw new LessonServiceError(
				400,
				'La definición JSON de la lesson no tiene la estructura esperada.'
			);
		}

		const definition = parseResult.data as LessonDefinition;
		return this.validateDefinition(definition);
	}

	static validateDefinition(definition: LessonDefinition): LessonDefinition {
		const blockMap = new Map(definition.blocks.map((block) => [block.id, block]));
		const duplicatedIds = definition.blocks
			.map((block) => block.id)
			.filter((id, index, list) => list.indexOf(id) !== index);

		if (duplicatedIds.length > 0) {
			throw new LessonServiceError(
				400,
				`Hay bloques con IDs duplicados: ${[...new Set(duplicatedIds)].join(', ')}.`
			);
		}

		if (!blockMap.has(definition.entryBlockId)) {
			throw new LessonServiceError(400, 'El bloque de entrada no existe en la definición.');
		}

		for (const block of definition.blocks) {
			this.assertBlockConfiguration(block);

			if (block.kind === 'end' && (block.next || block.branches?.length)) {
				throw new LessonServiceError(
					400,
					`El bloque final "${block.id}" no puede tener salidas adicionales.`
				);
			}

			if (block.kind === 'choice' && (block.next || block.branches?.length)) {
				throw new LessonServiceError(
					400,
					`El bloque de elección "${block.id}" debe usar únicamente destinos por opción.`
				);
			}

			if (block.kind !== 'end' && block.kind !== 'choice' && !block.next && !(block.branches?.length)) {
				throw new LessonServiceError(
					400,
					`El bloque "${block.id}" necesita un siguiente bloque o una rama condicional.`
				);
			}
		}

		const graph = this.buildTransitionGraph(definition);
		this.assertTransitionTargets(definition, blockMap);
		this.assertNoGraphCycles(graph, definition.entryBlockId);
		this.assertTemplateReferences(definition, graph);
		return definition;
	}

	static getAvailableVariables(definition: LessonDefinition): LessonAvailableVariable[] {
		const variables: LessonAvailableVariable[] = [
			{ path: 'session.id', label: 'ID de sesión', description: 'Identificador del intento actual.' },
			{
				path: 'session.attemptNumber',
				label: 'Número de intento',
				description: 'Intento actual del estudiante en esta lesson.'
			},
			{ path: 'session.status', label: 'Estado', description: 'Estado actual de la sesión.' },
			{ path: 'session.currentBlockId', label: 'Bloque actual', description: 'Bloque activo de la sesión.' },
			{ path: 'session.activityName', label: 'Nombre de la actividad', description: 'Nombre visible de la lesson.' },
			{ path: 'session.courseId', label: 'Curso', description: 'Curso asociado a la sesión.' }
		];

		for (const block of definition.blocks) {
			if (block.kind === 'choice') {
				const outputKey = block.outputKey || 'selection';
				variables.push(
					{ path: `blocks.${block.id}.outputs.${outputKey}`, label: `${block.title} · selección`, description: 'Valor elegido por el estudiante.' },
					{ path: `blocks.${block.id}.outputs.selectedLabel`, label: `${block.title} · etiqueta`, description: 'Etiqueta mostrada al estudiante.' }
				);
			}

			if (block.kind === 'agent') {
				variables.push(
					{ path: `blocks.${block.id}.outputs.response`, label: `${block.title} · respuesta`, description: 'Última respuesta de la IA en este bloque.' },
					{ path: `blocks.${block.id}.outputs.lastUserMessage`, label: `${block.title} · entrada`, description: 'Último mensaje del alumno en este bloque.' }
				);
				for (const field of block.agentConfig.outputSchema ?? []) {
					variables.push({
						path: `blocks.${block.id}.outputs.${field.key}`,
						label: `${block.title} · ${field.key}`,
						description: field.description || 'Salida estructurada del bloque IA.'
					});
				}
			}
		}

		return variables;
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
		const courseId = await this.resolveCourseId(input.interactiveLearningId, input.courseId ?? access.courseId);
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
			.orderBy(desc(interactiveLessonSession.attemptNumber), desc(interactiveLessonSession.createdAt))
			.get();

		if (!canBypassStatus) {
			if (activityData.activity.status === 'hidden' || activityData.activity.status === 'archived') {
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

		await db
			.update(interactiveLessonSession)
			.set({
				status: lessonAttemptStatus.RESTARTED,
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
	}): Promise<LessonSessionView> {
		const session = await db
			.select()
			.from(interactiveLessonSession)
			.where(eq(interactiveLessonSession.id, input.sessionId))
			.get();

		if (!session) {
			throw new LessonServiceError(404, 'Sesión de lesson no encontrada.');
		}

		if (input.interactiveLearningId && session.interactiveLearningId !== input.interactiveLearningId) {
			throw new LessonServiceError(404, 'La sesión no pertenece a esta lesson.');
		}

		await this.assertSessionAccess(session, input.userId, input.userRoleLevel);

		const activityData = await this.getLessonActivity(session.interactiveLearningId);
		const definition = this.parseDefinition(activityData.activity.content);
		const currentBlock = definition.blocks.find((block) => block.id === session.currentBlockId);

		if (!currentBlock) {
			throw new LessonServiceError(
				409,
				'El bloque actual ya no existe. Revisa la definición de la lesson.'
			);
		}

		const [blockStates, files] = await Promise.all([
			db
				.select()
				.from(interactiveLessonBlockState)
				.where(eq(interactiveLessonBlockState.sessionId, session.id))
				.all(),
			db
				.select()
				.from(interactiveLearningFile)
				.where(eq(interactiveLearningFile.interactiveLearningId, activityData.activity.id))
				.all()
		]);

		const currentBlockState =
			blockStates.find((blockState) => blockState.blockId === currentBlock.id) ?? null;
		const filesById = Object.fromEntries(files.map((file) => [file.id, file])) as Record<
			string,
			InteractiveLearningFile
		>;
		const templateContext = this.buildTemplateContext(session, activityData.activity, blockStates);
		const resolvedCurrentBlock = this.resolveBlock(currentBlock, templateContext);
		const currentAssets = this.resolveAssets(resolvedCurrentBlock, filesById);
		const currentChatMessages =
			currentBlock.kind === 'agent' && currentBlockState?.chatId
				? await this.loadBlockChatMessages(currentBlockState.chatId)
				: [];
		const isReadOnly =
			activityData.activity.status === 'closed' ||
			session.status === lessonAttemptStatus.COMPLETED;

		return {
			activity: activityData.activity,
			lesson: activityData.lesson,
			definition,
			session,
			blockStates,
			currentBlock,
			resolvedCurrentBlock,
			currentBlockState,
			currentAssets,
			currentChatMessages,
			files,
			filesById,
			availableVariables: this.getAvailableVariables(definition),
			canRestart:
				activityData.lesson.allowRestart &&
				session.userId === input.userId &&
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
			!normalizeOutputs(view.currentBlockState?.outputsJson).response
		) {
			throw new LessonServiceError(
				400,
				'Este bloque IA necesita al menos una respuesta antes de continuar.'
			);
		}

		return this.completeBlockAndEnterNext(view, normalizeOutputs(view.currentBlockState?.outputsJson));
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

		const rawOption = view.currentBlock.options.find((candidate) => candidate.id === input.optionId);
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

		await this.upsertBlockState({
			sessionId: view.session.id,
			blockId: view.currentBlock.id,
			status: lessonBlockStateStatus.COMPLETED,
			outputs,
			lastChoiceValue: option.value
		});

		await this.logEvent({
			interactiveLearningId: view.activity.id,
			sessionId: view.session.id,
			userId: view.session.userId,
			courseId: view.session.courseId,
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
			blockId: view.currentBlock.id,
			eventType: lessonEventType.BRANCH_TAKEN,
			payload: {
				targetBlockId: option.targetBlockId,
				label: option.label,
				value: rawOption?.value ?? option.value
			}
		});

		return this.enterBlock(view.session, option.targetBlockId, view.activity, view.lesson, view.definition);
	}

	static async submitAgentTurn(input: {
		sessionId: string;
		blockId: string;
		message: string;
		userId: string;
		userRoleLevel: number;
		interactiveLearningId?: string;
	}): Promise<{ session: InteractiveLessonSession; assistantMessage: string; outputs: JsonRecord }> {
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

		const currentOutputs = normalizeOutputs(view.currentBlockState?.outputsJson);
		if (
			view.currentBlock.agentConfig.mode === 'guided_turn' &&
			currentOutputs.response &&
			view.currentBlockState?.chatId
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

		const updatedModelMessages = [...aiMessages, { role: 'assistant' as const, content: assistantMessage }];
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

		await this.upsertBlockState({
			sessionId: view.session.id,
			blockId: view.currentBlock.id,
			status: lessonBlockStateStatus.ACTIVE,
			outputs,
			chatId: blockState.chatId!
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
		const transition = this.resolveTransition(view.currentBlock, view.session, view.activity, view.blockStates);
		if (!transition?.targetBlockId) {
			throw new LessonServiceError(
				400,
				`El bloque "${view.currentBlock.id}" no tiene salida disponible con el estado actual.`
			);
		}

		await this.upsertBlockState({
			sessionId: view.session.id,
			blockId: view.currentBlock.id,
			status: lessonBlockStateStatus.COMPLETED,
			outputs
		});

		await this.logEvent({
			interactiveLearningId: view.activity.id,
			sessionId: view.session.id,
			userId: view.session.userId,
			courseId: view.session.courseId,
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
				blockId: view.currentBlock.id,
				eventType: lessonEventType.BRANCH_TAKEN,
				payload: {
					targetBlockId: transition.targetBlockId,
					label: transition.label ?? null,
					condition: transition.condition ?? null
				}
			});
		}

		return this.enterBlock(view.session, transition.targetBlockId, view.activity, view.lesson, view.definition);
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

		await this.upsertBlockState({
			sessionId: session.id,
			blockId,
			status: block.kind === 'end' ? lessonBlockStateStatus.COMPLETED : lessonBlockStateStatus.ACTIVE
		});

		await db
			.update(interactiveLessonSession)
			.set({
				currentBlockId: blockId,
				status: nextStatus,
				lastActiveAt: now,
				completedAt: block.kind === 'end' ? now : null,
				sessionStateJson: JSON.stringify({
					...safeJsonParse<JsonRecord>(session.sessionStateJson, {}),
					currentBlockId: blockId,
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

	private static async ensureAgentBlockChat(view: LessonSessionView): Promise<InteractiveLessonBlockState> {
		if (view.currentBlock.kind !== 'agent') {
			throw new LessonServiceError(400, 'El bloque activo no es IA.');
		}

		if (view.resolvedCurrentBlock.kind !== 'agent') {
			throw new LessonServiceError(409, 'No se pudo resolver el bloque IA actual.');
		}

		if (view.currentBlockState?.chatId) {
			return view.currentBlockState;
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

		if (resolvedBlock.agentConfig.initialAssistantMessage?.trim()) {
			await AIUtils.saveMessage(
				chatId,
				resolvedBlock.agentConfig.initialAssistantMessage.trim(),
				'ASSISTANT'
			);
		}

		await this.upsertBlockState({
			sessionId: view.session.id,
			blockId: view.currentBlock.id,
			status: lessonBlockStateStatus.ACTIVE,
			outputs: normalizeOutputs(view.currentBlockState?.outputsJson),
			chatId
		});

		const updatedState = await db
			.select()
			.from(interactiveLessonBlockState)
			.where(
				and(
					eq(interactiveLessonBlockState.sessionId, view.session.id),
					eq(interactiveLessonBlockState.blockId, view.currentBlock.id)
				)
			)
			.get();

		if (!updatedState) {
			throw new LessonServiceError(500, 'No se pudo inicializar el bloque IA.');
		}

		return updatedState;
	}

	private static async extractAgentOutputs(input: {
		block: LessonAgentBlock;
		modelName: string;
		assistantMessage: string;
		userMessage: string;
		messages: ModelMessage[];
		context: { userId?: string; courseId?: string; interactiveLearningId?: string; chatId?: string };
	}): Promise<JsonRecord> {
		const baseOutputs: JsonRecord = {
			response: input.assistantMessage,
			lastUserMessage: input.userMessage,
			mode: input.block.agentConfig.mode
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
				'Eres un extractor de datos para una lesson secuencial.',
				'Devuelve exclusivamente un objeto JSON válido que siga este esquema:',
				schemaDescription,
				'Conversación:',
				transcript
			].join('\n\n');
			const extractedText = await AIUtils.generateText(extractionPrompt, input.modelName, input.context);
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

	private static buildTemplateContext(
		session: InteractiveLessonSession,
		activity: InteractiveLearning,
		blockStates: InteractiveLessonBlockState[]
	): { session: JsonRecord; blocks: Record<string, { outputs: JsonRecord }> } {
		return {
			session: {
				id: session.id,
				attemptNumber: session.attemptNumber,
				status: session.status,
				currentBlockId: session.currentBlockId,
				activityName: activity.name,
				courseId: session.courseId
			},
			blocks: Object.fromEntries(
				blockStates.map((blockState) => [
					blockState.blockId,
					{ outputs: normalizeOutputs(blockState.outputsJson) }
				])
			) as Record<string, { outputs: JsonRecord }>
		};
	}

	private static resolveStringTemplate(
		template: string | null | undefined,
		context: { session: JsonRecord; blocks: Record<string, { outputs: JsonRecord }> }
	): string {
		if (!template) return '';

		return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression) => {
			const value = this.resolveTemplateValue(expression.trim(), context);
			if (value === null || value === undefined) return '';
			if (typeof value === 'object') return JSON.stringify(value);
			return String(value);
		});
	}

	private static resolveTemplateValue(
		path: string,
		context: { session: JsonRecord; blocks: Record<string, { outputs: JsonRecord }> }
	): unknown {
		if (path.startsWith('session.')) {
			return path.split('.').slice(1).reduce<unknown>((current, segment) => {
				if (!current || typeof current !== 'object') return undefined;
				return (current as Record<string, unknown>)[segment];
			}, context.session);
		}

		if (!path.startsWith('blocks.')) return undefined;

		const [, blockId, scope, ...rest] = path.split('.');
		if (!blockId || scope !== 'outputs') return undefined;
		return rest.reduce<unknown>((current, segment) => {
			if (!current || typeof current !== 'object') return undefined;
			return (current as Record<string, unknown>)[segment];
		}, context.blocks[blockId]?.outputs);
	}

	private static resolveBlock(
		block: LessonBlock,
		context: { session: JsonRecord; blocks: Record<string, { outputs: JsonRecord }> }
	): LessonBlock {
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
		if (operator === 'not_exists') return left === undefined || left === null || String(left) === '';
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
		const isActive = input.status === lessonBlockStateStatus.ACTIVE;
		const shouldIncrementVisit = isActive && existing && existing.status !== lessonBlockStateStatus.ACTIVE;

		if (existing) {
			await db
				.update(interactiveLessonBlockState)
				.set({
					status: input.status as any,
					visitCount: shouldIncrementVisit ? existing.visitCount + 1 : existing.visitCount,
					enteredAt: shouldIncrementVisit ? now : existing.enteredAt,
					completedAt:
						input.status === lessonBlockStateStatus.COMPLETED ? now : existing.completedAt,
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
			visitCount:
				input.status === lessonBlockStateStatus.ACTIVE ||
				input.status === lessonBlockStateStatus.COMPLETED
					? 1
					: 0,
			enteredAt:
				input.status === lessonBlockStateStatus.ACTIVE ||
				input.status === lessonBlockStateStatus.COMPLETED
					? now
					: null,
			completedAt: input.status === lessonBlockStateStatus.COMPLETED ? now : null,
			lastChoiceValue: input.lastChoiceValue ?? null,
			outputsJson: serializedOutputs ?? null,
			chatId: input.chatId ?? null,
			metadata: null,
			createdAt: now,
			updatedAt: now
		});
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
		if (block.agentConfig.model) return block.agentConfig.model;
		return AIUtils.getDefaultModel();
	}

	private static async logEvent(input: {
		interactiveLearningId: string;
		sessionId: string;
		userId: string;
		courseId: string;
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

	private static assertNoGraphCycles(graph: Map<string, string[]>, entryBlockId: string): void {
		const visited = new Set<string>();
		const visiting = new Set<string>();
		const visit = (node: string) => {
			if (visiting.has(node)) {
				throw new LessonServiceError(400, `La lesson contiene un ciclo que pasa por "${node}".`);
			}
			if (visited.has(node)) return;
			visiting.add(node);
			for (const target of graph.get(node) ?? []) visit(target);
			visiting.delete(node);
			visited.add(node);
		};
		visit(entryBlockId);
	}

	private static assertTemplateReferences(definition: LessonDefinition, graph: Map<string, string[]>): void {
		const blockMap = new Map(definition.blocks.map((block) => [block.id, block]));
		for (const block of definition.blocks) {
			const refs = new Set<string>([
				...extractTemplateRefs((block as { body?: string }).body),
				...(block.kind === 'agent'
					? [
							...extractTemplateRefs(block.agentConfig.promptTemplate),
							...extractTemplateRefs(block.agentConfig.systemPrompt)
						]
					: []),
				...(block.kind === 'choice'
					? block.options.flatMap((option) => [
							...extractTemplateRefs(option.label),
							...extractTemplateRefs(option.description)
						])
					: [])
			]);
			for (const branch of block.branches ?? []) {
				if (branch.condition?.source) refs.add(branch.condition.source);
			}
			for (const ref of refs) {
				if (ref.startsWith('session.')) continue;
				if (!ref.startsWith('blocks.')) {
					throw new LessonServiceError(400, `La referencia "${ref}" del bloque "${block.id}" no usa un formato soportado.`);
				}
				const [, sourceBlockId, scope] = ref.split('.');
				if (!sourceBlockId || scope !== 'outputs') {
					throw new LessonServiceError(400, `La referencia "${ref}" del bloque "${block.id}" debe apuntar a outputs.`);
				}
				if (!blockMap.has(sourceBlockId)) {
					throw new LessonServiceError(400, `La referencia "${ref}" del bloque "${block.id}" apunta a un bloque inexistente.`);
				}
				if (sourceBlockId === block.id || this.canReach(graph, block.id, sourceBlockId)) {
					throw new LessonServiceError(400, `La referencia "${ref}" del bloque "${block.id}" depende de un bloque futuro o crea un ciclo de datos.`);
				}
			}
		}
	}

	private static canReach(
		graph: Map<string, string[]>,
		source: string,
		target: string,
		visited = new Set<string>()
	): boolean {
		if (source === target) return true;
		if (visited.has(source)) return false;
		visited.add(source);
		for (const next of graph.get(source) ?? []) {
			if (next === target || this.canReach(graph, next, target, visited)) return true;
		}
		return false;
	}

	private static isStaff(role: string | undefined): boolean {
		if (!role) return false;
		return CourseInteractiveAuthUtils.STAFF_ROLES.includes(
			role as (typeof CourseInteractiveAuthUtils.STAFF_ROLES)[number]
		);
	}
}
