<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		siteKey: string;
		theme?: 'light' | 'dark' | 'auto';
		size?: 'normal' | 'compact';
		onVerify?: (token: string) => void;
		onExpire?: () => void;
		onError?: (error: string) => void;
	}

	let {
		siteKey,
		theme = 'auto',
		size = 'normal',
		onVerify,
		onExpire,
		onError
	}: Props = $props();

	let container: HTMLDivElement;
	let widgetId: string | undefined;
	let token = $state('');
	let scriptLoaded = $state(false);

	// Expose token via binding
	export function getToken(): string {
		return token;
	}

	export function reset(): void {
		if (browser && widgetId && window.turnstile) {
			window.turnstile.reset(widgetId);
			token = '';
		}
	}

	function loadScript(): Promise<void> {
		return new Promise((resolve, reject) => {
			// Si ya está cargado, resolver inmediatamente
			if (window.turnstile) {
				resolve();
				return;
			}

			const existingScript = document.querySelector('script[src*="turnstile"]');
			if (existingScript) {
				// El script existe - puede estar cargando o ya cargado
				// Usar polling para esperar a que window.turnstile esté disponible
				const checkInterval = setInterval(() => {
					if (window.turnstile) {
						clearInterval(checkInterval);
						resolve();
					}
				}, 50);
				
				// Timeout después de 10 segundos
				setTimeout(() => {
					clearInterval(checkInterval);
					if (window.turnstile) {
						resolve();
					} else {
						reject(new Error('Turnstile script load timeout'));
					}
				}, 10000);
				return;
			}

			const script = document.createElement('script');
			script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
			script.async = true;
			script.defer = true;
			script.onload = () => {
				// Polling para asegurar que window.turnstile esté disponible
				const checkInterval = setInterval(() => {
					if (window.turnstile) {
						clearInterval(checkInterval);
						resolve();
					}
				}, 50);
				
				setTimeout(() => {
					clearInterval(checkInterval);
					if (window.turnstile) {
						resolve();
					} else {
						reject(new Error('Turnstile API not available after script load'));
					}
				}, 5000);
			};
			script.onerror = () => reject(new Error('Failed to load Turnstile script'));
			document.head.appendChild(script);
		});
	}

	function renderWidget(): void {
		if (!window.turnstile || !container) return;

		widgetId = window.turnstile.render(container, {
			sitekey: siteKey,
			theme,
			size,
			callback: (responseToken: string) => {
				token = responseToken;
				onVerify?.(responseToken);
			},
			'expired-callback': () => {
				token = '';
				onExpire?.();
			},
			'error-callback': (error: string) => {
				token = '';
				onError?.(error);
			}
		});
	}

	onMount(async () => {
		if (!browser) return;

		try {
			await loadScript();
			scriptLoaded = true;
			renderWidget();
		} catch (error) {
			console.error('Failed to initialize Turnstile:', error);
			onError?.(error instanceof Error ? error.message : 'Unknown error');
		}
	});

	onDestroy(() => {
		if (browser && widgetId && window.turnstile) {
			window.turnstile.remove(widgetId);
		}
	});
</script>

<div bind:this={container} class="turnstile-container"></div>
<input type="hidden" name="cf-turnstile-response" value={token} />

<style>
	.turnstile-container {
		display: flex;
		justify-content: center;
		min-height: 65px;
	}
</style>
