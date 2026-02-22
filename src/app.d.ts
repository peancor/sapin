// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user: import('$lib/server/auth').SessionValidationResult['user'];
			session: import('$lib/server/auth').SessionValidationResult['session'];
		}
	}

	// Cloudflare Turnstile types
	interface TurnstileOptions {
		sitekey: string;
		theme?: 'light' | 'dark' | 'auto';
		size?: 'normal' | 'compact';
		callback?: (token: string) => void;
		'expired-callback'?: () => void;
		'error-callback'?: (error: string) => void;
	}

	interface Turnstile {
		render: (container: HTMLElement, options: TurnstileOptions) => string;
		reset: (widgetId: string) => void;
		remove: (widgetId: string) => void;
		getResponse: (widgetId: string) => string | undefined;
	}

	interface Window {
		turnstile?: Turnstile;
	}
}

export {};
