import { graphPlotCardHandler } from './handlers/graphPlotCard.handler';
import { sharedImageCardHandler } from './handlers/sharedImageCard.handler';
import type { UIRendererHandler } from './types';

const passthroughHandler: UIRendererHandler = {
	componentKey: '__passthrough__',
	async validateAndBuildProps(input) {
		return { props: input };
	}
};

const UI_RENDERER_HANDLER_REGISTRY: Record<string, UIRendererHandler> = {
	[graphPlotCardHandler.componentKey]: graphPlotCardHandler,
	[sharedImageCardHandler.componentKey]: sharedImageCardHandler
};

export function getUIRendererHandler(componentKey: string): UIRendererHandler {
	return UI_RENDERER_HANDLER_REGISTRY[componentKey] ?? passthroughHandler;
}
