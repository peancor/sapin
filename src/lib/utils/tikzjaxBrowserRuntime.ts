import { base } from '$app/paths';

const tikzjaxScriptId = 'tikzjax-browser-runtime';
const tikzjaxRuntimeBasePath = `${base}/vendor/tikzjax-browser`;

let tikzjaxRuntimePromise: Promise<void> | null = null;

function getRuntimeWindow() {
	return window as Window & {
		TikzJax?: boolean;
		__tikzjaxRuntimeReady?: Promise<unknown>;
	};
}

export function getTikzjaxRuntimeBasePath() {
	return tikzjaxRuntimeBasePath;
}

export function loadTikzjaxBrowserRuntime(): Promise<void> {
	if (typeof window === 'undefined') {
		return Promise.resolve();
	}

	const runtimeWindow = getRuntimeWindow();
	const runtimeReadyPromise = runtimeWindow.__tikzjaxRuntimeReady;

	if (runtimeReadyPromise) {
		return runtimeReadyPromise.then(() => undefined);
	}

	if (tikzjaxRuntimePromise) {
		return tikzjaxRuntimePromise;
	}

	tikzjaxRuntimePromise = new Promise<void>((resolve, reject) => {
		const existingScript = document.getElementById(tikzjaxScriptId) as HTMLScriptElement | null;

		const resolveWhenRuntimeReady = () => {
			const currentRuntimeReadyPromise = runtimeWindow.__tikzjaxRuntimeReady;

			if (!currentRuntimeReadyPromise) {
				reject(new Error('TikZJax cargó el script principal, pero no expuso su promesa de inicialización.'));
				return;
			}

			currentRuntimeReadyPromise.then(() => resolve()).catch((error) => {
				reject(error instanceof Error ? error : new Error('No se pudo inicializar el runtime de TikZJax.'));
			});
		};

		if (existingScript) {
			existingScript.addEventListener('load', resolveWhenRuntimeReady, { once: true });
			existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar tikzjax.js.')), {
				once: true
			});

			if (runtimeWindow.TikzJax && runtimeWindow.__tikzjaxRuntimeReady) {
				resolveWhenRuntimeReady();
			}

			return;
		}

		const runtimeScript = document.createElement('script');
		runtimeScript.id = tikzjaxScriptId;
		runtimeScript.src = `${tikzjaxRuntimeBasePath}/tikzjax.js`;
		runtimeScript.async = true;
		runtimeScript.onload = resolveWhenRuntimeReady;
		runtimeScript.onerror = () => reject(new Error('No se pudo cargar tikzjax.js.'));
		document.head.append(runtimeScript);
	});

	return tikzjaxRuntimePromise;
}