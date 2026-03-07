import AttentionControlTest from './AttentionControlTest/index.svelte';
import AttentionControlTestLauncher from './AttentionControlTest/Launcher.svelte';
import ExecutiveFlexibilityTest from './ExecutiveFlexibilityTest/index.svelte';
import ExecutiveFlexibilityTestLauncher from './ExecutiveFlexibilityTest/Launcher.svelte';
 import FlashcardDeck from './FlashcardDeck/index.svelte';
 import GraphPlotCard from './GraphPlotCard/index.svelte';
 import ImmersiveTimedQuiz from './ImmersiveTimedQuiz/index.svelte';
 import ImmersiveTimedQuizLauncher from './ImmersiveTimedQuiz/Launcher.svelte';
 import QuizCard from './QuizCard/index.svelte';
 import SharedImageCard from './SharedImageCard/index.svelte';
 import SustainedAttentionTest from './SustainedAttentionTest/index.svelte';
 import SustainedAttentionTestLauncher from './SustainedAttentionTest/Launcher.svelte';
 import TimedQuizCard from './TimedQuizCard/index.svelte';
import WorkingMemoryTest from './WorkingMemoryTest/index.svelte';
import WorkingMemoryTestLauncher from './WorkingMemoryTest/Launcher.svelte';

interface UIComponentContext {
	instanceId: string;
	props: Record<string, unknown>;
	interactive: boolean;
	initialUserResponse?: Record<string, unknown>;
	apiBase: string;
	onRespond?: (score?: number) => void;
	onResponsePersisted?: (payload: Record<string, unknown>) => void;
	onImmersiveStateChange?: (state: ImmersiveUIState) => void;
}

export interface ImmersiveUIState {
	canCloseSafely: boolean;
	closePrompt?: string;
}

interface QuizQuestion {
	question: string;
	options: string[];
	correctIndex: number;
	explanation?: string;
}

interface Flashcard {
	front: string;
	back: string;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && isFinite(value) ? value : undefined;
}

function asQuizQuestions(value: unknown): QuizQuestion[] {
	if (!Array.isArray(value)) return [];

	return value
		.filter(
			(entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null
		)
		.map((entry) => ({
			question: asString(entry.question) ?? '',
			options: Array.isArray(entry.options)
				? entry.options.filter((option): option is string => typeof option === 'string')
				: [],
			correctIndex: asNumber(entry.correctIndex) ?? 0,
			explanation: asString(entry.explanation)
		}))
		.filter((question) => question.question.length > 0 && question.options.length > 0);
}

function asFlashcards(value: unknown): Flashcard[] {
	if (!Array.isArray(value)) return [];

	return value
		.filter(
			(entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null
		)
		.map((entry) => ({
			front: asString(entry.front) ?? '',
			back: asString(entry.back) ?? ''
		}))
		.filter((card) => card.front.length > 0 && card.back.length > 0);
}

function buildTimedQuizProps(ctx: UIComponentContext) {
	return {
		instanceId: ctx.instanceId,
		title: asString(ctx.props.title),
		difficulty:
			ctx.props.difficulty === 'easy' ||
			ctx.props.difficulty === 'medium' ||
			ctx.props.difficulty === 'hard'
				? ctx.props.difficulty
				: undefined,
		timerByDifficultySec:
			typeof ctx.props.timerByDifficultySec === 'object' &&
			ctx.props.timerByDifficultySec !== null
				? (ctx.props.timerByDifficultySec as { easy?: number; medium?: number; hard?: number })
				: undefined,
		autoAdvanceDelayMs: asNumber(ctx.props.autoAdvanceDelayMs),
		questions: asQuizQuestions(ctx.props.questions),
		interactive: ctx.interactive,
		initialUserResponse: ctx.initialUserResponse,
		apiBase: ctx.apiBase,
		onRespond: (score: number) => ctx.onRespond?.(score),
		onPersistedResponse: (payload: Record<string, unknown>) => ctx.onResponsePersisted?.(payload),
		onImmersiveStateChange: (state: ImmersiveUIState) => ctx.onImmersiveStateChange?.(state)
	};
}

function buildSustainedAttentionProps(ctx: UIComponentContext) {
	return {
		instanceId: ctx.instanceId,
		title: asString(ctx.props.title),
		testType: ctx.props.testType === 'go_no_go' ? ctx.props.testType : undefined,
		difficulty:
			ctx.props.difficulty === 'easy' ||
			ctx.props.difficulty === 'medium' ||
			ctx.props.difficulty === 'hard'
				? ctx.props.difficulty
				: undefined,
		instructions: asString(ctx.props.instructions),
		practiceTrials: asNumber(ctx.props.practiceTrials),
		mainTrials: asNumber(ctx.props.mainTrials),
		goStimulus: asString(ctx.props.goStimulus),
		noGoStimulus: asString(ctx.props.noGoStimulus),
		interactive: ctx.interactive,
		initialUserResponse: ctx.initialUserResponse,
		apiBase: ctx.apiBase,
		onRespond: (score: number) => ctx.onRespond?.(score),
		onPersistedResponse: (payload: Record<string, unknown>) => ctx.onResponsePersisted?.(payload),
		onImmersiveStateChange: (state: ImmersiveUIState) => ctx.onImmersiveStateChange?.(state)
	};
}

function buildAttentionControlProps(ctx: UIComponentContext) {
	return {
		instanceId: ctx.instanceId,
		title: asString(ctx.props.title),
		testType:
			ctx.props.testType === 'go_no_go' ||
			ctx.props.testType === 'stroop' ||
			ctx.props.testType === 'flanker' ||
			ctx.props.testType === 'sdmt'
				? ctx.props.testType
				: undefined,
		difficulty:
			ctx.props.difficulty === 'easy' ||
			ctx.props.difficulty === 'medium' ||
			ctx.props.difficulty === 'hard'
				? ctx.props.difficulty
				: undefined,
		instructions: asString(ctx.props.instructions),
		practiceTrials: asNumber(ctx.props.practiceTrials),
		mainTrials: asNumber(ctx.props.mainTrials),
		goStimulus: asString(ctx.props.goStimulus),
		noGoStimulus: asString(ctx.props.noGoStimulus),
		interactive: ctx.interactive,
		initialUserResponse: ctx.initialUserResponse,
		apiBase: ctx.apiBase,
		onRespond: (score: number) => ctx.onRespond?.(score),
		onPersistedResponse: (payload: Record<string, unknown>) => ctx.onResponsePersisted?.(payload),
		onImmersiveStateChange: (state: ImmersiveUIState) => ctx.onImmersiveStateChange?.(state)
	};
}

function buildWorkingMemoryProps(ctx: UIComponentContext) {
	return {
		instanceId: ctx.instanceId,
		title: asString(ctx.props.title),
		testType: ctx.props.testType === 'digit_span' ? ctx.props.testType : undefined,
		mode:
			ctx.props.mode === 'forward' ||
			ctx.props.mode === 'backward' ||
			ctx.props.mode === 'both'
				? ctx.props.mode
				: undefined,
		difficulty:
			ctx.props.difficulty === 'easy' ||
			ctx.props.difficulty === 'medium' ||
			ctx.props.difficulty === 'hard'
				? ctx.props.difficulty
				: undefined,
		instructions: asString(ctx.props.instructions),
		startLength: asNumber(ctx.props.startLength),
		maxLength: asNumber(ctx.props.maxLength),
		trialsPerLength: asNumber(ctx.props.trialsPerLength),
		interactive: ctx.interactive,
		initialUserResponse: ctx.initialUserResponse,
		apiBase: ctx.apiBase,
		onRespond: (score: number) => ctx.onRespond?.(score),
		onPersistedResponse: (payload: Record<string, unknown>) => ctx.onResponsePersisted?.(payload),
		onImmersiveStateChange: (state: ImmersiveUIState) => ctx.onImmersiveStateChange?.(state)
	};
}

function buildExecutiveFlexibilityProps(ctx: UIComponentContext) {
	return {
		instanceId: ctx.instanceId,
		title: asString(ctx.props.title),
		testType:
			ctx.props.testType === 'trail_making' || ctx.props.testType === 'wcst'
				? ctx.props.testType
				: undefined,
		instructions: asString(ctx.props.instructions),
		interactive: ctx.interactive,
		initialUserResponse: ctx.initialUserResponse,
		apiBase: ctx.apiBase,
		onRespond: (score?: number) => ctx.onRespond?.(score),
		onPersistedResponse: (payload: Record<string, unknown>) => ctx.onResponsePersisted?.(payload),
		onImmersiveStateChange: (state: ImmersiveUIState) => ctx.onImmersiveStateChange?.(state)
	};
}

interface InlineUIComponentRegistryEntry {
	renderStyle: 'inline';
	component: unknown;
	buildProps: (ctx: UIComponentContext) => Record<string, unknown>;
}

interface ImmersiveUIComponentRegistryEntry {
	renderStyle: 'immersive';
	launcherComponent: unknown;
	immersiveComponent: unknown;
	buildProps: (ctx: UIComponentContext) => Record<string, unknown>;
}

export type UIComponentRegistryEntry =
	| InlineUIComponentRegistryEntry
	| ImmersiveUIComponentRegistryEntry;

const uiComponentRegistry = {
	QuizCard: {
		renderStyle: 'inline',
		component: QuizCard,
		buildProps: (ctx: UIComponentContext) => ({
			instanceId: ctx.instanceId,
			title: asString(ctx.props.title),
			questions: asQuizQuestions(ctx.props.questions),
			interactive: ctx.interactive,
			initialUserResponse: ctx.initialUserResponse,
			apiBase: ctx.apiBase,
			onRespond: (score: number) => ctx.onRespond?.(score)
		})
	},
	FlashcardDeck: {
		renderStyle: 'inline',
		component: FlashcardDeck,
		buildProps: (ctx: UIComponentContext) => ({
			instanceId: ctx.instanceId,
			title: asString(ctx.props.title),
			cards: asFlashcards(ctx.props.cards),
			interactive: ctx.interactive,
			initialUserResponse: ctx.initialUserResponse,
			apiBase: ctx.apiBase,
			onRespond: () => ctx.onRespond?.()
		})
	},
	TimedQuizCard: {
		renderStyle: 'inline',
		component: TimedQuizCard,
		buildProps: (ctx: UIComponentContext) => ({
			...buildTimedQuizProps(ctx)
		})
	},
	ImmersiveTimedQuiz: {
		renderStyle: 'immersive',
		launcherComponent: ImmersiveTimedQuizLauncher,
		immersiveComponent: ImmersiveTimedQuiz,
		buildProps: (ctx: UIComponentContext) => ({
			...buildTimedQuizProps(ctx)
		})
	},
	SustainedAttentionTest: {
		renderStyle: 'immersive',
		launcherComponent: SustainedAttentionTestLauncher,
		immersiveComponent: SustainedAttentionTest,
		buildProps: (ctx: UIComponentContext) => ({
			...buildSustainedAttentionProps(ctx)
		})
	},
	AttentionControlTest: {
		renderStyle: 'immersive',
		launcherComponent: AttentionControlTestLauncher,
		immersiveComponent: AttentionControlTest,
		buildProps: (ctx: UIComponentContext) => ({
			...buildAttentionControlProps(ctx)
		})
	},
	WorkingMemoryTest: {
		renderStyle: 'immersive',
		launcherComponent: WorkingMemoryTestLauncher,
		immersiveComponent: WorkingMemoryTest,
		buildProps: (ctx: UIComponentContext) => ({
			...buildWorkingMemoryProps(ctx)
		})
	},
	ExecutiveFlexibilityTest: {
		renderStyle: 'immersive',
		launcherComponent: ExecutiveFlexibilityTestLauncher,
		immersiveComponent: ExecutiveFlexibilityTest,
		buildProps: (ctx: UIComponentContext) => ({
			...buildExecutiveFlexibilityProps(ctx)
		})
	},
	GraphPlotCard: {
		renderStyle: 'inline',
		component: GraphPlotCard,
		buildProps: (ctx: UIComponentContext) => ({
			instanceId: ctx.instanceId,
			mode: ctx.props.mode,
			title: asString(ctx.props.title),
			formula: ctx.props.formula,
			data: ctx.props.data,
			axes: ctx.props.axes,
			viewport: ctx.props.viewport,
			interactive: ctx.interactive,
			initialUserResponse: ctx.initialUserResponse,
			apiBase: ctx.apiBase,
			onRespond: (score?: number) => ctx.onRespond?.(score)
		})
	},
	SharedImageCard: {
		renderStyle: 'inline',
		component: SharedImageCard,
		buildProps: (ctx: UIComponentContext) => ({
			instanceId: ctx.instanceId,
			resourceId: asString(ctx.props.resourceId) ?? '',
			fileId: asString(ctx.props.fileId) ?? '',
			name: asString(ctx.props.name) ?? 'image',
			mimeType: asString(ctx.props.mimeType) ?? 'image/*',
			title: asString(ctx.props.title),
			caption: asString(ctx.props.caption),
			interactive: ctx.interactive,
			initialUserResponse: ctx.initialUserResponse,
			apiBase: ctx.apiBase,
			onRespond: () => ctx.onRespond?.()
		})
	}
} satisfies Record<string, UIComponentRegistryEntry>;

export function getUIComponentRegistryEntry(componentKey: string): UIComponentRegistryEntry | null {
	const key = componentKey as keyof typeof uiComponentRegistry;
	return uiComponentRegistry[key] ?? null;
}

export function isImmersiveUIComponentEntry(
	entry: UIComponentRegistryEntry | null
): entry is ImmersiveUIComponentRegistryEntry {
	return entry?.renderStyle === 'immersive';
}
