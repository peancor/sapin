export const lessonBlockKinds = ['content', 'choice', 'check', 'agent', 'youtube', 'end'] as const;
export type LessonBlockKind = (typeof lessonBlockKinds)[number];

export const lessonDefinitionVersions = ['1', '2'] as const;
export type LessonDefinitionVersion = (typeof lessonDefinitionVersions)[number];

export const lessonSessionPolicies = ['resume_latest', 'always_new_attempt'] as const;
export type LessonSessionPolicy = (typeof lessonSessionPolicies)[number];

export const lessonAttemptStatuses = ['active', 'completed', 'restarted', 'abandoned'] as const;
export type LessonAttemptStatus = (typeof lessonAttemptStatuses)[number];

export const lessonBlockStateStatuses = ['pending', 'active', 'completed', 'skipped'] as const;
export type LessonBlockStateStatus = (typeof lessonBlockStateStatuses)[number];

export const lessonBlockVisitStatuses = ['active', 'completed', 'skipped', 'abandoned'] as const;
export type LessonBlockVisitStatus = (typeof lessonBlockVisitStatuses)[number];

export const lessonConditionOperators = [
	'equals',
	'not_equals',
	'contains',
	'exists',
	'not_exists',
	'gt',
	'gte',
	'lt',
	'lte'
] as const;
export type LessonConditionOperator = (typeof lessonConditionOperators)[number];

export const lessonOutputFieldTypes = ['string', 'number', 'boolean', 'json'] as const;
export type LessonOutputFieldType = (typeof lessonOutputFieldTypes)[number];

export const lessonReferenceNamespaces = ['session', 'state', 'outputs'] as const;
export type LessonReferenceNamespace = (typeof lessonReferenceNamespaces)[number];

export const lessonAgentInteractionModes = ['single_turn', 'multi_turn', 'none'] as const;
export type LessonAgentInteractionMode = (typeof lessonAgentInteractionModes)[number];

export const lessonAgentExecutionTriggers = ['on_user_submit', 'on_enter'] as const;
export type LessonAgentExecutionTrigger = (typeof lessonAgentExecutionTriggers)[number];

export const lessonAgentRuntimeModes = ['basic', 'agent'] as const;
export type LessonAgentRuntimeMode = (typeof lessonAgentRuntimeModes)[number];

export const lessonCheckModes = [
	'single_choice',
	'multiple_choice',
	'true_false',
	'numeric',
	'short_text'
] as const;
export type LessonCheckMode = (typeof lessonCheckModes)[number];

export const lessonCheckPresentationModes = ['all_at_once', 'step_by_step'] as const;
export type LessonCheckPresentationMode = (typeof lessonCheckPresentationModes)[number];

export const lessonCheckCompletionRules = ['pass_or_exhaust', 'after_first_submit'] as const;
export type LessonCheckCompletionRule = (typeof lessonCheckCompletionRules)[number];

export const lessonCheckTextMatchModes = ['exact', 'contains', 'regex'] as const;
export type LessonCheckTextMatchMode = (typeof lessonCheckTextMatchModes)[number];

export interface LessonVariableRef {
	path: string;
	source: 'session' | 'block-state' | 'block-output';
}

export interface LessonOutputField {
	key: string;
	type: LessonOutputFieldType;
	description?: string;
}

export interface LessonBlockGraphMeta {
	position?: {
		x: number;
		y: number;
	};
	incomingOrder?: string[];
	edgeRoutes?: Record<string, LessonBlockGraphEdgeRoute>;
}

export interface LessonBlockGraphRoutePoint {
	x: number;
	y: number;
}

export interface LessonBlockGraphEdgeRoute {
	points: LessonBlockGraphRoutePoint[];
}

export interface LessonBlockExposure {
	outputs?: LessonOutputField[];
}

export interface LessonAssetRef {
	fileId: string;
	kind?: 'image' | 'video' | 'audio' | 'file';
	caption?: string;
}

export interface LessonTransitionCondition {
	source: string;
	operator: LessonConditionOperator;
	value?: string | number | boolean | null;
}

export interface LessonTransition {
	id?: string;
	label?: string;
	targetBlockId: string;
	condition?: LessonTransitionCondition;
}

interface LessonBlockBase {
	id: string;
	kind: LessonBlockKind;
	title: string;
	next?: string | null;
	branches?: LessonTransition[];
	graph?: LessonBlockGraphMeta;
	exposure?: LessonBlockExposure;
}

export interface LessonContentBlock extends LessonBlockBase {
	kind: 'content';
	body: string;
	continueLabel?: string;
	assetRefs?: LessonAssetRef[];
}

export interface LessonChoiceOption {
	id: string;
	label: string;
	value: string;
	description?: string;
	targetBlockId: string;
}

export interface LessonChoiceBlock extends LessonBlockBase {
	kind: 'choice';
	body?: string;
	options: LessonChoiceOption[];
	outputKey?: string;
}

export interface LessonCheckOption {
	id: string;
	label: string;
	value: string;
	description?: string;
}

export interface LessonCheckAcceptedRange {
	min?: number;
	max?: number;
}

export type LessonCheckAiGenerationDifficulty = 'easy' | 'medium' | 'hard';

export interface LessonCheckAiGenerationConfigInput {
	model?: string;
	objective?: string;
	count?: number;
	difficulty?: LessonCheckAiGenerationDifficulty;
	allowedModes?: LessonCheckMode[];
}

export interface LessonCheckAiGenerationConfig {
	model: string;
	objective: string;
	count: number;
	difficulty: LessonCheckAiGenerationDifficulty;
	allowedModes: LessonCheckMode[];
}

interface LessonCheckQuestionBase {
	id: string;
	prompt: string;
	mode: LessonCheckMode;
}

export interface LessonCheckChoiceQuestion extends LessonCheckQuestionBase {
	mode: 'single_choice' | 'multiple_choice' | 'true_false';
	options: LessonCheckOption[];
	correctOptionIds: string[];
}

export interface LessonCheckNumericQuestion extends LessonCheckQuestionBase {
	mode: 'numeric';
	acceptedRange?: LessonCheckAcceptedRange;
	acceptedExact: number | null;
	tolerance: number | null;
}

export interface LessonCheckShortTextQuestion extends LessonCheckQuestionBase {
	mode: 'short_text';
	acceptedAnswers: string[];
	caseSensitive: boolean;
	trimWhitespace: boolean;
	matchMode: LessonCheckTextMatchMode;
}

export type LessonCheckQuestion =
	| LessonCheckChoiceQuestion
	| LessonCheckNumericQuestion
	| LessonCheckShortTextQuestion;

export interface LessonCheckGenerationProposal {
	id: string;
	question: LessonCheckQuestion;
	answerRationale: string;
	sourceRationale: string;
	validationNotes: string;
	confidence: number;
}

export interface LessonCheckGenerationRejection {
	prompt?: string;
	mode: LessonCheckMode;
	reason: string;
}

export interface LessonCheckConfigInput {
	submitLabel?: string;
	continueLabel?: string;
	retryLabel?: string;
	maxAttempts?: number | null;
	completionRule?: LessonCheckCompletionRule;
	passingScore?: number;
	feedbackCorrect?: string;
	feedbackIncorrect?: string;
	feedbackPartial?: string;
	revealCorrectAnswer?: boolean;
	presentationMode?: LessonCheckPresentationMode;
	questions?: LessonCheckQuestion[];
	aiGeneration?: LessonCheckAiGenerationConfigInput;
}

export interface LessonCheckConfig extends LessonCheckConfigInput {
	maxAttempts: number | null;
	completionRule: LessonCheckCompletionRule;
	passingScore: number;
	revealCorrectAnswer: boolean;
	presentationMode: LessonCheckPresentationMode;
	questions: LessonCheckQuestion[];
	aiGeneration: LessonCheckAiGenerationConfig;
}

export interface LessonCheckBlock extends LessonBlockBase {
	kind: 'check';
	body?: string;
	checkConfig: LessonCheckConfig;
}

export interface LessonAgentConfigInput {
	runtimeMode?: LessonAgentRuntimeMode;
	interactionMode?: LessonAgentInteractionMode;
	executionTrigger?: LessonAgentExecutionTrigger;
	autoStartOnEnter?: boolean;
	model?: string | null;
	systemPrompt?: string | null;
	promptTemplate: string;
	placeholder?: string;
	submitLabel?: string;
	continueLabel?: string;
	initialAssistantMessage?: string;
	launchMessageTemplate?: string;
	maxTurns?: number | null;
	enabledToolIds?: string[];
	outputSchema?: LessonOutputField[];
}

export interface LessonAgentConfig extends Omit<
	LessonAgentConfigInput,
	'interactionMode' | 'executionTrigger'
> {
	runtimeMode?: LessonAgentRuntimeMode;
	interactionMode: LessonAgentInteractionMode;
	executionTrigger: LessonAgentExecutionTrigger;
	autoStartOnEnter: boolean;
}

export interface LessonAgentBlock extends LessonBlockBase {
	kind: 'agent';
	body?: string;
	agentConfig: LessonAgentConfig;
	requiresResponse?: boolean;
}

export interface LessonYoutubePausePoint {
	id: string;
	seconds: number;
	title?: string;
	body?: string;
	resumeLabel?: string;
}

export interface LessonYoutubeBlock extends LessonBlockBase {
	kind: 'youtube';
	videoId: string;
	body?: string;
	startSeconds?: number | null;
	endSeconds?: number | null;
	continueLabel?: string;
	pausePoints?: LessonYoutubePausePoint[];
}

export interface LessonEndBlock extends LessonBlockBase {
	kind: 'end';
	body?: string;
	ctaLabel?: string;
}

export type LessonBlock =
	| LessonContentBlock
	| LessonChoiceBlock
	| LessonCheckBlock
	| LessonAgentBlock
	| LessonYoutubeBlock
	| LessonEndBlock;

export interface LessonDefinition {
	version: '2';
	entryBlockId: string;
	allowedAgentToolIds?: string[];
	blocks: LessonBlock[];
}

export interface LessonAvailableVariable {
	path: string;
	label: string;
	description: string;
	namespace?: LessonReferenceNamespace;
	blockId?: string;
	source?: 'session' | 'block-state' | 'block-output';
}

export interface LessonBlockContractField {
	path: string;
	key: string;
	label: string;
	description: string;
	type: LessonOutputFieldType | 'date' | 'integer' | 'status';
	source: 'system' | 'public';
	namespace: Exclude<LessonReferenceNamespace, 'session'>;
	availableWhen: 'always' | 'after_visit' | 'after_completion';
}

export interface LessonBlockContract {
	blockId: string;
	blockTitle: string;
	blockKind: LessonBlockKind;
	state: LessonBlockContractField[];
	outputs: LessonBlockContractField[];
}

export interface LessonBlockReferenceGroups {
	blockId: string;
	blockTitle: string;
	state: LessonAvailableVariable[];
	outputs: LessonAvailableVariable[];
}

export interface LessonBlockGraphSummary {
	blockId: string;
	incomingBlockIds: string[];
	outgoingBlockIds: string[];
	contracts: LessonBlockContract;
}

export function normalizeLessonAgentConfig(input: LessonAgentConfigInput): LessonAgentConfig {
	const runtimeMode = input.runtimeMode ?? 'basic';
	const interactionMode = input.interactionMode ?? 'single_turn';
	const executionTrigger =
		input.executionTrigger ?? (interactionMode === 'none' ? 'on_enter' : 'on_user_submit');
	const autoStartOnEnter = interactionMode === 'none' ? true : (input.autoStartOnEnter ?? false);
	const enabledToolIds =
		input.enabledToolIds === undefined
			? undefined
			: input.enabledToolIds
					.map((value) => value.trim())
					.filter(Boolean)
					.filter((value, index, list) => list.indexOf(value) === index);

	return {
		runtimeMode,
		model: input.model ?? null,
		systemPrompt: input.systemPrompt ?? null,
		promptTemplate: input.promptTemplate,
		placeholder: input.placeholder,
		submitLabel: input.submitLabel,
		continueLabel: input.continueLabel,
		initialAssistantMessage: input.initialAssistantMessage,
		launchMessageTemplate: input.launchMessageTemplate,
		maxTurns: input.maxTurns ?? null,
		enabledToolIds,
		outputSchema: input.outputSchema,
		interactionMode,
		executionTrigger,
		autoStartOnEnter
	};
}

export function createLessonCheckTrueFalseOptions(): LessonCheckOption[] {
	return [
		{
			id: 'true',
			label: 'Verdadero',
			value: 'true',
			description: ''
		},
		{
			id: 'false',
			label: 'Falso',
			value: 'false',
			description: ''
		}
	];
}

function normalizeLessonCheckQuestion(question: LessonCheckQuestion, index: number): LessonCheckQuestion {
	const id = question.id?.trim() || `question_${index + 1}`;
	const prompt = question.prompt?.trim() || `Pregunta ${index + 1}`;

	if (question.mode === 'true_false') {
		const firstCorrect = question.correctOptionIds?.[0];
		return {
			id,
			prompt,
			mode: 'true_false',
			options: createLessonCheckTrueFalseOptions(),
			correctOptionIds: [firstCorrect === 'false' ? 'false' : 'true']
		};
	}

	if (question.mode === 'single_choice' || question.mode === 'multiple_choice') {
		const options = question.options.map((option, optionIndex) => {
			const optionId = option.id?.trim() || `option_${optionIndex + 1}`;
			return {
				id: optionId,
				label: option.label?.trim() || `Opcion ${optionIndex + 1}`,
				value: option.value?.trim() || optionId,
				description: option.description
			};
		});
		const validOptionIds = new Set(options.map((option) => option.id));
		const correctOptionIds = question.correctOptionIds.filter((optionId) =>
			validOptionIds.has(optionId)
		);

		return {
			id,
			prompt,
			mode: question.mode,
			options,
			correctOptionIds:
				question.mode === 'multiple_choice'
					? [...new Set(correctOptionIds)]
					: correctOptionIds.slice(0, 1)
		};
	}

	if (question.mode === 'numeric') {
		return {
			id,
			prompt,
			mode: 'numeric',
			acceptedRange: question.acceptedRange
				? {
						...(question.acceptedRange.min !== undefined ? { min: question.acceptedRange.min } : {}),
						...(question.acceptedRange.max !== undefined ? { max: question.acceptedRange.max } : {})
					}
				: undefined,
			acceptedExact: question.acceptedExact ?? null,
			tolerance: question.tolerance ?? null
		};
	}

	if (question.mode === 'short_text') {
		return {
			id,
			prompt,
			mode: 'short_text',
			acceptedAnswers: [...question.acceptedAnswers],
			caseSensitive: question.caseSensitive ?? false,
			trimWhitespace: question.trimWhitespace ?? true,
			matchMode: question.matchMode ?? 'exact'
		};
	}

	return {
		id,
		prompt,
		mode: 'single_choice',
		options: [
			{ id: 'option_1', label: 'Opcion 1', value: 'option_1', description: '' },
			{ id: 'option_2', label: 'Opcion 2', value: 'option_2', description: '' }
		],
		correctOptionIds: ['option_1']
	};
}

function normalizeLessonCheckAiGenerationConfig(
	input?: LessonCheckAiGenerationConfigInput
): LessonCheckAiGenerationConfig {
	const allowedModes =
		input?.allowedModes
			?.filter((mode) => lessonCheckModes.includes(mode))
			.filter((mode, index, list) => list.indexOf(mode) === index) ?? [];
	const difficulty = input?.difficulty ?? 'medium';
	const count = Math.min(12, Math.max(1, Math.trunc(input?.count ?? 3)));

	return {
		model: input?.model?.trim() ?? '',
		objective: input?.objective?.trim() ?? '',
		count,
		difficulty,
		allowedModes: [allowedModes[0] ?? 'single_choice']
	};
}

export function normalizeLessonCheckConfig(input: LessonCheckConfigInput): LessonCheckConfig {
	return {
		submitLabel: input.submitLabel,
		continueLabel: input.continueLabel,
		retryLabel: input.retryLabel,
		maxAttempts: input.maxAttempts ?? 1,
		completionRule: input.completionRule ?? 'pass_or_exhaust',
		passingScore: input.passingScore ?? 1,
		feedbackCorrect: input.feedbackCorrect,
		feedbackIncorrect: input.feedbackIncorrect,
		feedbackPartial: input.feedbackPartial,
		revealCorrectAnswer: input.revealCorrectAnswer ?? false,
		presentationMode: input.presentationMode ?? 'all_at_once',
		questions: (input.questions ?? []).map(normalizeLessonCheckQuestion),
		aiGeneration: normalizeLessonCheckAiGenerationConfig(input.aiGeneration)
	};
}

export function isValidLessonAgentConfig(
	config: Pick<LessonAgentConfig, 'interactionMode' | 'executionTrigger'>
): boolean {
	return (
		(config.interactionMode === 'single_turn' && config.executionTrigger === 'on_user_submit') ||
		(config.interactionMode === 'multi_turn' && config.executionTrigger === 'on_user_submit') ||
		(config.interactionMode === 'none' && config.executionTrigger === 'on_enter')
	);
}

export function isLessonAgentInteractive(
	config: Pick<LessonAgentConfig, 'interactionMode'>
): boolean {
	return config.interactionMode !== 'none';
}

export function getLessonAgentInteractionLabel(
	config: Pick<LessonAgentConfig, 'interactionMode'>
): string {
	if (config.interactionMode === 'multi_turn') return 'Mini chat';
	if (config.interactionMode === 'single_turn') return 'Turno guiado';
	return 'Generacion automatica';
}

export function getLessonAgentInteractionDescription(
	config: Pick<LessonAgentConfig, 'interactionMode' | 'autoStartOnEnter'>
): string {
	if (config.interactionMode === 'single_turn') {
		return config.autoStartOnEnter
			? 'La IA puede abrir el bloque automáticamente. El alumno puede intervenir una sola vez y la IA puede cerrar con feedback u otra respuesta final.'
			: 'El bloque espera una única intervención del alumno y después la IA responde para cerrar el intercambio.';
	}

	if (config.interactionMode === 'multi_turn') {
		return config.autoStartOnEnter
			? 'La IA puede abrir la conversación al entrar y después continuar en formato mini chat con varias intervenciones del alumno.'
			: 'La conversación empieza cuando el alumno envía su primer mensaje y puede continuar en formato mini chat.';
	}

	return 'El bloque no admite mensajes del alumno. La IA genera la respuesta automáticamente al entrar.';
}

export function getLessonCheckModeLabel(mode: LessonCheckMode): string {
	if (mode === 'single_choice') return 'Opción única';
	if (mode === 'multiple_choice') return 'Respuesta múltiple';
	if (mode === 'true_false') return 'Verdadero/Falso';
	if (mode === 'numeric') return 'Numérico';
	return 'Texto corto';
}

export function getLessonAgentExecutionTriggerLabel(
	config: Pick<LessonAgentConfig, 'executionTrigger'>
): string {
	return config.executionTrigger === 'on_enter' ? 'Al entrar' : 'Al enviar';
}
