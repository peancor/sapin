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

export interface TikzjaxBrowserPrepareInput {
	source: string;
	texPackages?: string[];
	tikzLibraries?: string[];
	addToPreamble?: string;
	ariaLabel?: string;
	width?: string;
	height?: string;
	showConsole?: boolean;
	disableCache?: boolean;
}

export interface TikzjaxBrowserPreparedDiagram {
	request: TikzjaxBrowserRenderRequest;
	normalizedSource: string;
	normalizationNotes: string[];
	detectedPackages: string[];
	detectedLibraries: string[];
	unsupportedPackages: string[];
}

export type TikzjaxBrowserRenderState = 'idle' | 'rendering' | 'ready' | 'error';
