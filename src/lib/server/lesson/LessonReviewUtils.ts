import type {
	InteractiveLessonBlockState,
	InteractiveLessonBlockVisit,
	InteractiveLessonEvent,
	InteractiveLessonSession
} from '$lib/server/db/schema';
import { lessonAttemptStatuses, type LessonBlock, type LessonDefinition } from '$lib/types/lesson';
import type {
	LessonReviewAlert,
	LessonReviewAlertKind,
	LessonReviewAttemptStatus,
	LessonReviewAttemptSummary
} from '$lib/types/lessonReview';

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
	if (!value) return {};

	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function coerceNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function coerceBoolean(value: unknown): boolean {
	return value === true || value === 'true';
}

function createAlert(
	kind: LessonReviewAlertKind,
	label: string,
	description: string,
	severity: LessonReviewAlert['severity']
): LessonReviewAlert {
	return { kind, label, description, severity };
}

function getBlockMap(definition: LessonDefinition): Map<string, LessonBlock> {
	return new Map(definition.blocks.map((block) => [block.id, block]));
}

function getReviewStatus(
	session: InteractiveLessonSession,
	alerts: LessonReviewAlert[]
): LessonReviewAttemptStatus {
	if (session.status === 'completed') return 'completed';
	if (session.status === 'abandoned' || session.status === 'restarted' || alerts.length > 0) {
		return 'attention';
	}
	return 'active';
}

export function buildLessonReviewAttemptSummary(input: {
	definition: LessonDefinition;
	session: InteractiveLessonSession;
	blockStates: InteractiveLessonBlockState[];
	blockVisits: InteractiveLessonBlockVisit[];
	events: InteractiveLessonEvent[];
}): LessonReviewAttemptSummary {
	const { definition, session, blockStates, blockVisits, events } = input;
	const blockMap = getBlockMap(definition);
	const currentBlock = blockMap.get(session.currentBlockId);
	const completedBlocksCount = blockStates.filter((state) => state.status === 'completed').length;
	const visitedBlocksCount = blockStates.filter((state) => state.visitCount > 0).length;
	const revisitedBlocks = blockStates.filter((state) => state.visitCount > 1).length;
	const branchCount = events.filter((event) => event.eventType === 'branch_taken').length;
	const checkStates = blockStates.filter((state) => blockMap.get(state.blockId)?.kind === 'check');
	const checksPassed = checkStates.filter((state) => {
		const outputs = parseJsonRecord(state.outputsJson);
		return coerceBoolean(outputs.passed);
	}).length;
	const checksPending = checkStates.filter((state) => {
		const outputs = parseJsonRecord(state.outputsJson);
		return state.status !== 'completed' || !coerceBoolean(outputs.passed);
	}).length;
	const checkRetryBlocks = checkStates.filter((state) => {
		const outputs = parseJsonRecord(state.outputsJson);
		return (coerceNumber(outputs.attemptCount) ?? 0) >= 2 || state.visitCount > 1;
	}).length;
	const hasAgentBlocks = blockVisits.some((visit) => blockMap.get(visit.blockId)?.kind === 'agent');
	const currentVisit = blockVisits.find((visit) => visit.id === session.currentVisitId) ?? null;
	const currentVisitOutputs = parseJsonRecord(currentVisit?.outputsJson);

	const alerts: LessonReviewAlert[] = [];

	if (
		session.status === 'active' &&
		currentBlock?.kind === 'check' &&
		(currentVisit?.status !== 'completed' || !coerceBoolean(currentVisitOutputs.passed))
	) {
		alerts.push(
			createAlert(
				'checkpoint_blocked',
				'Checkpoint bloqueado',
				'El intento sigue activo en un bloque de evaluación aún no superado o no cerrado.',
				'critical'
			)
		);
	}

	if (checkRetryBlocks > 0) {
		alerts.push(
			createAlert(
				'repeated_retry',
				'Reintentos repetidos',
				'Hay bloques de evaluación con dos o más intentos o bloques revisitados varias veces.',
				'warning'
			)
		);
	}

	if (revisitedBlocks > 0) {
		alerts.push(
			createAlert(
				'looping_path',
				'Recorrido en bucle',
				'El intento ha pasado varias veces por al menos un mismo bloque.',
				'warning'
			)
		);
	}

	if (
		session.status === 'abandoned' ||
		blockVisits.some((visit) => visit.status === 'abandoned')
	) {
		alerts.push(
			createAlert(
				'abandoned_attempt',
				'Intento abandonado',
				'La sesión o alguna visita quedó marcada como abandonada.',
				'critical'
			)
		);
	}

	if (branchCount >= 3) {
		alerts.push(
			createAlert(
				'branch_complexity',
				'Recorrido complejo',
				'El intento acumuló varias decisiones de rama antes de cerrarse.',
				'info'
			)
		);
	}

	return {
		sessionId: session.id,
		userId: session.userId,
		attemptNumber: session.attemptNumber,
		sessionStatus: lessonAttemptStatuses.includes(session.status as (typeof lessonAttemptStatuses)[number])
			? (session.status as (typeof lessonAttemptStatuses)[number])
			: 'active',
		reviewStatus: getReviewStatus(session, alerts),
		currentBlockId: session.currentBlockId,
		currentBlockTitle: currentBlock?.title ?? session.currentBlockId,
		currentBlockKind: currentBlock?.kind ?? 'content',
		startedAt: session.startedAt,
		lastActiveAt: session.lastActiveAt,
		completedAt: session.completedAt ?? null,
		visitedBlocksCount,
		completedBlocksCount,
		totalBlocks: definition.blocks.length,
		totalVisits: blockVisits.length,
		branchCount,
		checksPassed,
		checksPending,
		checkRetryBlocks,
		revisitedBlocks,
		hasAgentBlocks,
		alerts
	};
}

export { coerceBoolean, coerceNumber, parseJsonRecord };
