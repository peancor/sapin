import { graphPlotCardHandler } from './handlers/graphPlotCard.handler';
import { flashcardDeckHandler } from './handlers/flashcardDeck.handler';
import { quizCardHandler } from './handlers/quizCard.handler';
import { sharedImageCardHandler } from './handlers/sharedImageCard.handler';
import { timedQuizCardHandler } from './handlers/timedQuizCard.handler';
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
