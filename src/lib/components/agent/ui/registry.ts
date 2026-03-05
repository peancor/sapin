import QuizCard from './QuizCard.svelte';
import FlashcardDeck from './FlashcardDeck.svelte';
import TimedQuizCard from './TimedQuizCard.svelte';
import GraphPlotCard from './GraphPlotCard.svelte';
import SharedImageCard from './SharedImageCard.svelte';

interface UIComponentContext {
	instanceId: string;
	props: Record<string, unknown>;
	interactive: boolean;
	initialUserResponse?: Record<string, unknown>;
	apiBase: string;
	onRespond?: (score?: number) => void;
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

const uiComponentRegistry = {
	QuizCard: {
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
		component: TimedQuizCard,
		buildProps: (ctx: UIComponentContext) => ({
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
			onRespond: (score: number) => ctx.onRespond?.(score)
		})
	},
	GraphPlotCard: {
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
} as const;

export type UIComponentRegistryEntry =
	(typeof uiComponentRegistry)[keyof typeof uiComponentRegistry];

export function getUIComponentRegistryEntry(componentKey: string): UIComponentRegistryEntry | null {
	const key = componentKey as keyof typeof uiComponentRegistry;
	return uiComponentRegistry[key] ?? null;
}
