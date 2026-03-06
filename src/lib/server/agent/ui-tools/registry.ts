import { graphPlotCardHandler } from './handlers/graph-plot-card';
import { flashcardDeckHandler } from './handlers/flashcard-deck';
import { quizCardHandler } from './handlers/quiz-card';
import { sharedImageCardHandler } from './handlers/shared-image-card';
import { timedQuizCardHandler } from './handlers/timed-quiz-card';
import type { UIRendererHandler } from './types';

const UI_RENDERER_HANDLER_REGISTRY: Record<string, UIRendererHandler> = {
	[quizCardHandler.componentKey]: quizCardHandler,
	[timedQuizCardHandler.componentKey]: timedQuizCardHandler,
	[flashcardDeckHandler.componentKey]: flashcardDeckHandler,
	[graphPlotCardHandler.componentKey]: graphPlotCardHandler,
	[sharedImageCardHandler.componentKey]: sharedImageCardHandler
};

export function getUIRendererHandler(componentKey: string): UIRendererHandler | null {
	return UI_RENDERER_HANDLER_REGISTRY[componentKey] ?? null;
}
