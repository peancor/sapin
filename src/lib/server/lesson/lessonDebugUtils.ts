import type {
	LessonBlock,
	LessonBlockGraphSummary,
	LessonConditionOperator,
	LessonDefinition
} from '../../types/lesson.ts';
import type {
	LessonDebugBlockSummary,
	LessonDebugTransitionEvaluation
} from '../../types/lessonDebug.ts';

type LessonDebugSessionLike = {
	id: string;
	attemptNumber: number;
	status: string;
	currentBlockId: string;
	currentVisitId: string | null;
	courseId: string;
	createdAt: Date;
};

type LessonDebugActivityLike = {
	name: string;
};

type LessonDebugBlockStateLike = {
	blockId: string;
	status: string;
	visitCount: number;
	lastVisitId: string | null;
	enteredAt: Date | null;
	completedAt: Date | null;
	outputsJson: string | null;
};

type LessonDebugVisitLike = {
	id: string;
	blockId: string;
	visitNumber: number;
	status: string;
	outputsJson: string | null;
};

type LessonDebugEventLike = {
	blockId: string | null;
	eventType: string;
};

type LessonTemplateContext = {
	session: Record<string, unknown>;
	blocks: Record<string, { state: Record<string, unknown>; outputs: Record<string, unknown> }>;
};

export function parseLessonDebugJsonRecord(
	value: string | null | undefined
): Record<string, unknown> {
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

export function buildLessonDebugTemplateContext(input: {
	session: LessonDebugSessionLike;
	activity: LessonDebugActivityLike;
	blockStates: LessonDebugBlockStateLike[];
}): LessonTemplateContext {
	return {
		session: {
			id: input.session.id,
			attemptNumber: input.session.attemptNumber,
			status: input.session.status,
			currentBlockId: input.session.currentBlockId,
			currentVisitId: input.session.currentVisitId,
			activityName: input.activity.name,
			courseId: input.session.courseId
		},
		blocks: Object.fromEntries(
			input.blockStates.map((blockState) => [
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
						completed: blockState.status === 'completed',
						...parseLessonDebugJsonRecord(blockState.outputsJson)
					}
				}
			])
		) as LessonTemplateContext['blocks']
	};
}

export function resolveLessonDebugTemplateValue(
	path: string,
	context: LessonTemplateContext
): unknown {
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

export function resolveLessonDebugStringTemplate(
	template: string | null | undefined,
	context: LessonTemplateContext
): string {
	if (!template) return '';

	return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression) => {
		const value = resolveLessonDebugTemplateValue(expression.trim(), context);
		if (value === null || value === undefined) return '';
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	});
}

export function resolveLessonDebugBlock(
	block: LessonBlock,
	context: LessonTemplateContext
): LessonBlock {
	if (block.kind === 'agent') {
		return {
			...block,
			title: resolveLessonDebugStringTemplate(block.title, context),
			body: resolveLessonDebugStringTemplate(block.body || '', context),
			agentConfig: {
				...block.agentConfig,
				placeholder: resolveLessonDebugStringTemplate(block.agentConfig.placeholder || '', context),
				submitLabel: resolveLessonDebugStringTemplate(block.agentConfig.submitLabel || '', context),
				continueLabel: resolveLessonDebugStringTemplate(
					block.agentConfig.continueLabel || '',
					context
				),
				systemPrompt: resolveLessonDebugStringTemplate(
					block.agentConfig.systemPrompt || '',
					context
				),
				promptTemplate: resolveLessonDebugStringTemplate(block.agentConfig.promptTemplate, context),
				initialAssistantMessage: resolveLessonDebugStringTemplate(
					block.agentConfig.initialAssistantMessage || '',
					context
				),
				launchMessageTemplate: resolveLessonDebugStringTemplate(
					block.agentConfig.launchMessageTemplate || '',
					context
				)
			}
		};
	}

	if (block.kind === 'choice') {
		return {
			...block,
			title: resolveLessonDebugStringTemplate(block.title, context),
			body: resolveLessonDebugStringTemplate(block.body || '', context),
			options: block.options.map((option) => ({
				...option,
				label: resolveLessonDebugStringTemplate(option.label, context),
				description: resolveLessonDebugStringTemplate(option.description || '', context)
			}))
		};
	}

	if (block.kind === 'check') {
		return {
			...block,
			title: resolveLessonDebugStringTemplate(block.title, context),
			body: resolveLessonDebugStringTemplate(block.body || '', context),
			checkConfig: {
				...block.checkConfig,
				submitLabel: resolveLessonDebugStringTemplate(block.checkConfig.submitLabel || '', context),
				continueLabel: resolveLessonDebugStringTemplate(
					block.checkConfig.continueLabel || '',
					context
				),
				retryLabel: resolveLessonDebugStringTemplate(block.checkConfig.retryLabel || '', context),
				feedbackCorrect: resolveLessonDebugStringTemplate(
					block.checkConfig.feedbackCorrect || '',
					context
				),
				feedbackIncorrect: resolveLessonDebugStringTemplate(
					block.checkConfig.feedbackIncorrect || '',
					context
				),
				feedbackPartial: resolveLessonDebugStringTemplate(
					block.checkConfig.feedbackPartial || '',
					context
				),
				questions: block.checkConfig.questions.map((question) => ({
					...question,
					prompt: resolveLessonDebugStringTemplate(question.prompt, context),
					...(question.mode === 'single_choice' ||
					question.mode === 'multiple_choice' ||
					question.mode === 'true_false'
						? {
								options: question.options.map((option) => ({
									...option,
									label: resolveLessonDebugStringTemplate(option.label, context),
									description: resolveLessonDebugStringTemplate(option.description || '', context)
								}))
							}
						: {}),
					...(question.mode === 'short_text'
						? {
								acceptedAnswers: question.acceptedAnswers.map((answer) =>
									resolveLessonDebugStringTemplate(answer, context)
								)
							}
						: {})
				}))
			}
		};
	}

	if (block.kind === 'content') {
		return {
			...block,
			title: resolveLessonDebugStringTemplate(block.title, context),
			body: resolveLessonDebugStringTemplate(block.body, context),
			continueLabel: resolveLessonDebugStringTemplate(block.continueLabel || '', context)
		};
	}

	if (block.kind === 'youtube') {
		return {
			...block,
			title: resolveLessonDebugStringTemplate(block.title, context),
			body: resolveLessonDebugStringTemplate(block.body || '', context),
			continueLabel: resolveLessonDebugStringTemplate(block.continueLabel || '', context),
			pausePoints: (block.pausePoints ?? []).map((pausePoint) => ({
				...pausePoint,
				title: resolveLessonDebugStringTemplate(pausePoint.title || '', context),
				body: resolveLessonDebugStringTemplate(pausePoint.body || '', context),
				resumeLabel: resolveLessonDebugStringTemplate(pausePoint.resumeLabel || '', context)
			}))
		};
	}

	return {
		...block,
		title: resolveLessonDebugStringTemplate(block.title, context),
		body: resolveLessonDebugStringTemplate(block.body || '', context),
		ctaLabel: resolveLessonDebugStringTemplate(block.ctaLabel || '', context)
	};
}

export function evaluateLessonDebugCondition(
	operator: LessonConditionOperator,
	left: unknown,
	right: unknown
): boolean {
	if (operator === 'equals') return left === right;
	if (operator === 'not_equals') return left !== right;
	if (operator === 'contains') return String(left ?? '').includes(String(right ?? ''));
	if (operator === 'exists') return left !== undefined && left !== null && String(left) !== '';
	if (operator === 'not_exists') {
		return left === undefined || left === null || String(left) === '';
	}
	if (operator === 'gt') return Number(left) > Number(right);
	if (operator === 'gte') return Number(left) >= Number(right);
	if (operator === 'lt') return Number(left) < Number(right);
	if (operator === 'lte') return Number(left) <= Number(right);
	return false;
}

export function pickLessonDebugPreviewSession(input: {
	requestedSessionId?: string | null;
	sessions: LessonDebugSessionLike[];
}): LessonDebugSessionLike | null {
	const activeSessions = input.sessions.filter(
		(session) => session.status !== 'restarted' && session.status !== 'abandoned'
	);
	if (activeSessions.length === 0) return null;

	if (input.requestedSessionId) {
		const requested = activeSessions.find((session) => session.id === input.requestedSessionId);
		if (requested) return requested;
	}

	return (
		[...activeSessions].sort(
			(left, right) =>
				right.attemptNumber - left.attemptNumber ||
				right.createdAt.getTime() - left.createdAt.getTime()
		)[0] ?? null
	);
}

export function evaluateLessonDebugTransitions(input: {
	block: LessonBlock;
	resolvedBlock: LessonBlock;
	session: LessonDebugSessionLike;
	activity: LessonDebugActivityLike;
	blockStates: LessonDebugBlockStateLike[];
}): LessonDebugTransitionEvaluation[] {
	const context = buildLessonDebugTemplateContext({
		session: input.session,
		activity: input.activity,
		blockStates: input.blockStates
	});
	const evaluations: LessonDebugTransitionEvaluation[] = [];
	const currentOutputs =
		parseLessonDebugJsonRecord(
			input.blockStates.find((blockState) => blockState.blockId === input.block.id)?.outputsJson
		) ?? {};

	if (input.block.kind === 'choice' && input.resolvedBlock.kind === 'choice') {
		for (const option of input.resolvedBlock.options) {
			const selectedOptionId =
				typeof currentOutputs.optionId === 'string' ? currentOutputs.optionId : null;
			evaluations.push({
				id: `choice:${input.block.id}:${option.id}`,
				kind: 'choice-option',
				label: option.label,
				targetBlockId: option.targetBlockId,
				matches: selectedOptionId === option.id,
				reason:
					selectedOptionId === option.id
						? 'Fue la opción seleccionada en la última visita registrada.'
						: 'Ruta disponible al pulsar esta opción.',
				source: input.block.outputKey || 'selection',
				operator: null,
				expectedValue: option.value,
				actualValue: selectedOptionId
			});
		}

		return evaluations;
	}

	let matchedBranch = false;
	for (const [index, branch] of (input.block.branches ?? []).entries()) {
		const actualValue = branch.condition
			? resolveLessonDebugTemplateValue(branch.condition.source, context)
			: null;
		const matches = branch.condition
			? evaluateLessonDebugCondition(branch.condition.operator, actualValue, branch.condition.value)
			: true;
		if (matches) matchedBranch = true;

		evaluations.push({
			id: branch.id ?? `branch:${input.block.id}:${index}`,
			kind: 'branch',
			label: resolveLessonDebugStringTemplate(branch.label || '', context) || null,
			targetBlockId: branch.targetBlockId,
			matches,
			reason: branch.condition
				? matches
					? 'La condición se cumple con el estado actual de la preview.'
					: 'La condición no se cumple con el estado actual de la preview.'
				: 'Rama incondicional disponible.',
			source: branch.condition?.source ?? null,
			operator: branch.condition?.operator ?? null,
			expectedValue: branch.condition?.value ?? null,
			actualValue
		});
	}

	if (input.block.next) {
		evaluations.push({
			id: `next:${input.block.id}`,
			kind: 'next',
			label: null,
			targetBlockId: input.block.next,
			matches: !matchedBranch,
			reason: matchedBranch
				? 'Hay al menos una rama condicional que se resuelve antes del fallback lineal.'
				: 'No hay ninguna rama condicional que aplique, así que se usa la salida lineal.',
			source: null,
			operator: null,
			expectedValue: null,
			actualValue: null
		});
	}

	return evaluations;
}

export function buildLessonDebugBlockSummaries(input: {
	definition: LessonDefinition;
	session: LessonDebugSessionLike;
	blockStates: LessonDebugBlockStateLike[];
	blockVisits: LessonDebugVisitLike[];
	events: LessonDebugEventLike[];
	selectedBlockId: string;
	getBlockGraphSummary: (definition: LessonDefinition, blockId: string) => LessonBlockGraphSummary;
}): LessonDebugBlockSummary[] {
	const stateByBlock = new Map(
		input.blockStates.map((blockState) => [blockState.blockId, blockState])
	);
	const visitsByBlock = new Map<string, LessonDebugVisitLike[]>();
	for (const visit of input.blockVisits) {
		const bucket = visitsByBlock.get(visit.blockId) ?? [];
		bucket.push(visit);
		visitsByBlock.set(visit.blockId, bucket);
	}

	return input.definition.blocks.map((block) => {
		const state = stateByBlock.get(block.id) ?? null;
		const visits = visitsByBlock.get(block.id) ?? [];
		const latestVisit =
			[...visits].sort((left, right) => right.visitNumber - left.visitNumber)[0] ?? null;
		const outputs = parseLessonDebugJsonRecord(state?.outputsJson ?? latestVisit?.outputsJson);
		const hasCheckAlert =
			block.kind === 'check' &&
			block.id === input.session.currentBlockId &&
			(outputs.passed !== true || state?.status !== 'completed');
		const hasAlerts =
			hasCheckAlert ||
			visits.some((visit) => visit.status === 'abandoned') ||
			(state?.visitCount ?? 0) > 1 ||
			input.events.some(
				(event) => event.blockId === block.id && event.eventType === 'branch_taken'
			);
		const visualState =
			block.id === input.session.currentBlockId
				? 'current'
				: state?.status === 'completed'
					? 'completed'
					: (state?.visitCount ?? 0) > 0
						? 'visited'
						: 'pending';

		return {
			blockId: block.id,
			title: block.title,
			kind: block.kind,
			isEntry: input.definition.entryBlockId === block.id,
			isCurrent: input.session.currentBlockId === block.id,
			isSelected: input.selectedBlockId === block.id,
			visualState,
			visitCount: state?.visitCount ?? visits.length,
			completed: state?.status === 'completed',
			revisited: (state?.visitCount ?? visits.length) > 1,
			hasAlerts,
			latestVisitStatus: latestVisit?.status ?? null,
			graph: input.getBlockGraphSummary(input.definition, block.id)
		};
	});
}
