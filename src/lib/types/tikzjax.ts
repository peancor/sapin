export interface TikzjaxBrowserRenderRequest {
	source: string;
	texPackagesJson: string;
	tikzLibraries: string;
	addToPreamble: string;
	showConsole: boolean;
	disableCache: boolean;
	ariaLabel: string;
	width: string;
	height: string;
}

export type TikzjaxBrowserRenderState = 'idle' | 'rendering' | 'ready' | 'error';