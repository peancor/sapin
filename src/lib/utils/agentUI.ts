const PASSIVE_UI_COMPONENT_KEYS = new Set(['GraphPlotCard', 'SharedImageCard']);

export function uiComponentRequiresResponse(componentKey: string): boolean {
	return !PASSIVE_UI_COMPONENT_KEYS.has(componentKey);
}

export function uiComponentIsPassive(componentKey: string): boolean {
	return !uiComponentRequiresResponse(componentKey);
}
