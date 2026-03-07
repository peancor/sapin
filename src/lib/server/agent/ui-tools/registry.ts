import { attentionControlTestHandler } from './handlers/attention-control-test';
import { drivingPsychotechTestHandler } from './handlers/driving-psychotech-test';
import { executiveFlexibilityTestHandler } from './handlers/executive-flexibility-test';
import { graphPlotCardHandler } from './handlers/graph-plot-card';
import { immersiveTimedQuizHandler } from './handlers/immersive-timed-quiz';
import { flashcardDeckHandler } from './handlers/flashcard-deck';
import { quizCardHandler } from './handlers/quiz-card';
import { sharedImageCardHandler } from './handlers/shared-image-card';
import { sustainedAttentionTestHandler } from './handlers/sustained-attention-test';
import { timedQuizCardHandler } from './handlers/timed-quiz-card';
import { workingMemoryTestHandler } from './handlers/working-memory-test';
import type { UIRendererHandler } from './types';

const UI_RENDERER_HANDLER_REGISTRY: Record<string, UIRendererHandler> = {
	[quizCardHandler.componentKey]: quizCardHandler,
	[timedQuizCardHandler.componentKey]: timedQuizCardHandler,
	[immersiveTimedQuizHandler.componentKey]: immersiveTimedQuizHandler,
	[attentionControlTestHandler.componentKey]: attentionControlTestHandler,
	[drivingPsychotechTestHandler.componentKey]: drivingPsychotechTestHandler,
	[executiveFlexibilityTestHandler.componentKey]: executiveFlexibilityTestHandler,
	[flashcardDeckHandler.componentKey]: flashcardDeckHandler,
	[graphPlotCardHandler.componentKey]: graphPlotCardHandler,
	[sharedImageCardHandler.componentKey]: sharedImageCardHandler,
	[sustainedAttentionTestHandler.componentKey]: sustainedAttentionTestHandler,
	[workingMemoryTestHandler.componentKey]: workingMemoryTestHandler
};

export function getUIRendererHandler(componentKey: string): UIRendererHandler | null {
	return UI_RENDERER_HANDLER_REGISTRY[componentKey] ?? null;
}
