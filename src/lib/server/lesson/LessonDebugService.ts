import { and, asc, desc, eq } from 'drizzle-orm';

import { AgentTranscriptService } from '$lib/server/agent/AgentTranscriptService';
import { db } from '$lib/server/db';
import {
	interactiveLessonBlockVisit,
	interactiveLessonEvent,
	interactiveLessonSession,
	lessonSessionScope,
	message,
	type InteractiveLearning,
	type InteractiveLessonBlockState,
	type InteractiveLessonBlockVisit,
	type InteractiveLessonEvent,
	type InteractiveLessonSession
} from '$lib/server/db/schema';
import type { AgentDisplayMessage } from '$lib/types/agent';
import type { LessonBlock } from '$lib/types/lesson';
import type {
	LessonDebugAgentTranscript,
	LessonDebugEventRecord,
	LessonDebugInspectorState,
	LessonDebugPreviewMode,
	LessonDebugSessionOption,
	LessonDebugSnapshot,
	LessonDebugVisitRecord
} from '$lib/types/lessonDebug';
import { LessonService } from './LessonService';
import {
	buildLessonDebugBlockSummaries,
	buildLessonDebugTemplateContext,
	evaluateLessonDebugTransitions,
	parseLessonDebugJsonRecord,
	pickLessonDebugPreviewSession,
	resolveLessonDebugBlock
} from './lessonDebugUtils.ts';

function mapVisit(visit: InteractiveLessonBlockVisit): LessonDebugVisitRecord {
	return {
		visitId: visit.id,
		visitNumber: visit.visitNumber,
		blockId: visit.blockId,
		status: visit.status,
		enteredAt: visit.enteredAt,
		completedAt: visit.completedAt ?? null,
		chatId: visit.chatId ?? null,
		lastChoiceValue: visit.lastChoiceValue ?? null,
		outputs: parseLessonDebugJsonRecord(visit.outputsJson),
		metadata: parseLessonDebugJsonRecord(visit.metadata)
	};
}

function mapEvent(event: InteractiveLessonEvent): LessonDebugEventRecord {
	return {
		id: event.id,
		eventType: event.eventType,
		blockId: event.blockId ?? null,
		visitId: event.visitId ?? null,
		createdAt: event.createdAt,
		payload: parseLessonDebugJsonRecord(event.payloadJson)
	};
}

export class LessonDebugService {
	static async getSnapshot(input: {
		courseId: string;
		activity: InteractiveLearning;
		previewMode: LessonDebugPreviewMode;
		userId: string;
		userRoleLevel: number;
		sessionId?: string | null;
		selectedBlockId?: string | null;
	}): Promise<LessonDebugSnapshot> {
		const session = await LessonService.selectOrCreatePreviewSession({
			interactiveLearningId: input.activity.id,
			userId: input.userId,
			userRoleLevel: input.userRoleLevel,
			courseId: input.courseId,
			previewMode: input.previewMode,
			sessionId: input.sessionId
		});
		const runtimeView = await LessonService.getSessionView({
			sessionId: session.id,
			userId: input.userId,
			userRoleLevel: input.userRoleLevel,
			interactiveLearningId: input.activity.id
		});
		const scope =
			input.previewMode === 'draft'
				? lessonSessionScope.PREVIEW_DRAFT
				: lessonSessionScope.PREVIEW_PUBLISHED;
		const revisionId = runtimeView.session.definitionRevisionId;
		const [events, previewSessions] = await Promise.all([
			db
				.select()
				.from(interactiveLessonEvent)
				.where(eq(interactiveLessonEvent.sessionId, runtimeView.session.id))
				.orderBy(asc(interactiveLessonEvent.createdAt))
				.all(),
			revisionId
				? db
						.select()
						.from(interactiveLessonSession)
						.where(
							and(
								eq(interactiveLessonSession.interactiveLearningId, input.activity.id),
								eq(interactiveLessonSession.userId, input.userId),
								eq(interactiveLessonSession.courseId, input.courseId),
								eq(interactiveLessonSession.scope, scope),
								eq(interactiveLessonSession.definitionRevisionId, revisionId)
							)
						)
						.orderBy(
							desc(interactiveLessonSession.attemptNumber),
							desc(interactiveLessonSession.createdAt)
						)
						.all()
				: Promise.resolve([runtimeView.session])
		]);
		const selectedBlock =
			runtimeView.definition.blocks.find((block) => block.id === input.selectedBlockId) ??
			runtimeView.currentBlock;
		const templateContext = buildLessonDebugTemplateContext({
			session: runtimeView.session,
			activity: runtimeView.activity,
			blockStates: runtimeView.blockStates
		});
		const resolvedSelectedBlock = resolveLessonDebugBlock(selectedBlock, templateContext);
		const selectedBlockState =
			runtimeView.blockStates.find((blockState) => blockState.blockId === selectedBlock.id) ?? null;
		const selectedVisits = runtimeView.blockVisits
			.filter((visit) => visit.blockId === selectedBlock.id)
			.sort((left, right) => right.visitNumber - left.visitNumber);
		const latestVisit = selectedVisits[0] ?? null;
		const selectedEvents = events
			.filter((event) => event.blockId === selectedBlock.id || event.visitId === latestVisit?.id)
			.map(mapEvent);
		const agentTranscript = await this.loadAgentTranscript({
			block: selectedBlock,
			visit: latestVisit,
			stateChatId: selectedBlockState?.chatId ?? null
		});

		return {
			activity: {
				id: runtimeView.activity.id,
				name: runtimeView.activity.name,
				description: runtimeView.activity.description ?? null,
				status: runtimeView.activity.status
			},
			previewMode: input.previewMode,
			sessionOptions: previewSessions.map((previewSession) => ({
				id: previewSession.id,
				attemptNumber: previewSession.attemptNumber,
				status: previewSession.status,
				startedAt: previewSession.startedAt,
				lastActiveAt: previewSession.lastActiveAt,
				completedAt: previewSession.completedAt ?? null,
				isSelected: previewSession.id === runtimeView.session.id
			} satisfies LessonDebugSessionOption)),
			currentBlockId: runtimeView.currentBlock.id,
			selectedBlockId: selectedBlock.id,
			blockSummaries: buildLessonDebugBlockSummaries({
				definition: runtimeView.definition,
				session: runtimeView.session,
				blockStates: runtimeView.blockStates,
				blockVisits: runtimeView.blockVisits,
				events,
				selectedBlockId: selectedBlock.id,
				getBlockGraphSummary: LessonService.getBlockGraphSummary
			}),
			inspector: {
				blockId: selectedBlock.id,
				originalBlock: selectedBlock,
				resolvedBlock: resolvedSelectedBlock,
				graph: LessonService.getBlockGraphSummary(runtimeView.definition, selectedBlock.id),
				state: selectedBlockState
					? {
							status: selectedBlockState.status,
							visitCount: selectedBlockState.visitCount,
							enteredAt: selectedBlockState.enteredAt ?? null,
							completedAt: selectedBlockState.completedAt ?? null,
							lastVisitId: selectedBlockState.lastVisitId ?? null,
							lastChoiceValue: selectedBlockState.lastChoiceValue ?? null,
							chatId: selectedBlockState.chatId ?? null,
							outputs: parseLessonDebugJsonRecord(selectedBlockState.outputsJson),
							metadata: parseLessonDebugJsonRecord(selectedBlockState.metadata)
						}
					: null,
				latestVisit: latestVisit ? mapVisit(latestVisit) : null,
				visits: selectedVisits.map(mapVisit),
				transitions: evaluateLessonDebugTransitions({
					block: selectedBlock,
					resolvedBlock: resolvedSelectedBlock,
					session: runtimeView.session,
					activity: runtimeView.activity,
					blockStates: runtimeView.blockStates
				}),
				agentTranscript,
				sessionEvents: selectedEvents
			} satisfies LessonDebugInspectorState,
			events: events.map(mapEvent),
			runtimeView
		};
	}

	private static async loadAgentTranscript(input: {
		block: LessonBlock;
		visit: InteractiveLessonBlockVisit | null;
		stateChatId: string | null;
	}): Promise<LessonDebugAgentTranscript | null> {
		if (input.block.kind !== 'agent') return null;

		const chatId = input.visit?.chatId ?? input.stateChatId;
		if (!chatId) return null;

		if (input.block.agentConfig.runtimeMode === 'agent') {
			const messages = await AgentTranscriptService.getDisplayMessages(chatId);
			return {
				mode: 'agent',
				chatId,
				runtimeMessages: messages,
				basicMessages: []
			};
		}

		const basicMessages = await db
			.select({
				id: message.id,
				type: message.type,
				content: message.content,
				createdAt: message.createdAt
			})
			.from(message)
			.where(eq(message.chatId, chatId))
			.orderBy(asc(message.createdAt))
			.all();

		return {
			mode: 'basic',
			chatId,
			runtimeMessages: [] satisfies AgentDisplayMessage[],
			basicMessages: basicMessages.filter((entry) => entry.type !== 'SYSTEM')
		};
	}
}
