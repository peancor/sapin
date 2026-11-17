<script lang="ts">
	import { tick } from 'svelte';
	import { CircleCheck, CircleAlert, Info, X } from 'lucide-svelte';
	import { toasts, TOAST_AUTO_DISMISS_MS, type ToastItem } from '$lib/stores/toasts.svelte';

	let region: HTMLDivElement | null = $state(null);
	// Texto para lectores de pantalla en navegadores sin `ariaNotify()`.
	let liveMessage = $state('');
	// Avisos ya presentados (anunciados y con su temporizador en marcha).
	// Registros simples a propósito: no deben ser reactivos (se modifican dentro del efecto).
	const presented: Record<number, true> = {};
	const timers: Record<number, ReturnType<typeof setTimeout>> = {};
	let paused = false;
	let focusBeforeRegion: HTMLElement | null = null;
	let waitingForDialog = false;

	const supportsPopover =
		typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');

	function setRegionOpen(open: boolean) {
		if (!region || !supportsPopover) return;
		const isOpen = region.matches(':popover-open');
		if (open && !isOpen) region.showPopover();
		else if (!open && isOpen) region.hidePopover();
	}

	function announce(item: ToastItem) {
		const target = region as (HTMLElement & { ariaNotify?: (text: string) => void }) | null;
		if (target && typeof target.ariaNotify === 'function') {
			target.ariaNotify(item.message);
			return;
		}
		// Respaldo: región viva presente desde la carga; se vacía antes para repetir mensajes.
		liveMessage = '';
		void tick().then(() => (liveMessage = item.message));
	}

	function startTimer(item: ToastItem) {
		if (item.kind === 'error' || timers[item.id] !== undefined) return;
		timers[item.id] = setTimeout(() => {
			delete timers[item.id];
			toasts.dismiss(item.id);
		}, TOAST_AUTO_DISMISS_MS);
	}

	function stopTimers() {
		for (const id of Object.keys(timers)) {
			clearTimeout(timers[Number(id)]);
			delete timers[Number(id)];
		}
	}

	function present(items: ToastItem[]) {
		// Con un diálogo modal abierto la región quedaría inerte y el aviso pasaría
		// inadvertido: se espera a que se cierre.
		const modal = document.querySelector('dialog:modal');
		if (modal && items.length > 0) {
			setRegionOpen(false);
			if (!waitingForDialog) {
				waitingForDialog = true;
				modal.addEventListener(
					'close',
					() => {
						waitingForDialog = false;
						present(toasts.items);
					},
					{ once: true }
				);
			}
			return;
		}

		setRegionOpen(items.length > 0);
		for (const item of items) {
			if (presented[item.id]) continue;
			presented[item.id] = true;
			announce(item);
			if (!paused) startTimer(item);
		}
	}

	$effect(() => {
		const items = toasts.items;
		if (!region) return;

		const liveIds = items.map((item) => item.id);
		for (const key of Object.keys(presented)) {
			const id = Number(key);
			if (liveIds.includes(id)) continue;
			delete presented[id];
			clearTimeout(timers[id]);
			delete timers[id];
		}
		present(items);
	});

	$effect(() => stopTimers);

	// El cierre automático se pausa mientras el puntero o el foco están sobre los avisos.
	function pause() {
		paused = true;
		stopTimers();
	}

	function resume() {
		paused = false;
		for (const item of toasts.items) {
			if (presented[item.id]) startTimer(item);
		}
	}

	function handleFocusIn(event: FocusEvent) {
		const from = event.relatedTarget;
		if (from instanceof HTMLElement && !region?.contains(from)) focusBeforeRegion = from;
		pause();
	}

	function handleFocusOut(event: FocusEvent) {
		if (event.relatedTarget instanceof Node && region?.contains(event.relatedTarget)) return;
		resume();
	}

	async function dismiss(item: ToastItem, event: MouseEvent) {
		const button = event.currentTarget as HTMLElement;
		const hadFocus = document.activeElement === button;
		const index = toasts.items.findIndex((candidate) => candidate.id === item.id);
		toasts.dismiss(item.id);
		if (!hadFocus) return;

		// El foco pasa al siguiente aviso o vuelve a donde estaba antes de entrar aquí.
		await tick();
		const buttons = region?.querySelectorAll<HTMLElement>('[data-toast-close]') ?? [];
		const next = buttons[Math.min(index, buttons.length - 1)];
		if (next) next.focus();
		else if (focusBeforeRegion?.isConnected) focusBeforeRegion.focus();
	}
</script>

<p class="sr-only">Avisos para lectores de pantalla</p>
<div class="sr-only" aria-live="polite">{liveMessage}</div>

<div
	bind:this={region}
	popover="manual"
	role="region"
	aria-label="Notificaciones"
	class="toast-region"
	onmouseenter={pause}
	onmouseleave={resume}
	onfocusin={handleFocusIn}
	onfocusout={handleFocusOut}
>
	{#each toasts.items as item (item.id)}
		<div
			class="toast-item"
			class:toast-error={item.kind === 'error'}
			class:toast-success={item.kind === 'success'}
		>
			<span class="toast-icon" aria-hidden="true">
				{#if item.kind === 'error'}
					<CircleAlert size={18} />
				{:else if item.kind === 'success'}
					<CircleCheck size={18} />
				{:else}
					<Info size={18} />
				{/if}
			</span>
			<p class="toast-text">
				<span class="sr-only">{item.kind === 'error' ? 'Error:' : 'Aviso:'}</span>
				{item.message}
			</p>
			<button
				type="button"
				class="toast-close"
				data-toast-close
				aria-label="Cerrar aviso"
				onclick={(event) => dismiss(item, event)}
			>
				<X size={16} aria-hidden="true" />
			</button>
		</div>
	{/each}
</div>

<style>
	.toast-region {
		/* Anula el centrado por defecto de los popover y coloca la pila abajo a la derecha. */
		position: fixed;
		inset: auto 1rem 1rem auto;
		z-index: 70;
		margin: 0;
		border: 0;
		padding: 0;
		background: transparent;
		overflow: visible;
		flex-direction: column;
		gap: 0.5rem;
		width: min(24rem, calc(100vw - 2rem));
		max-height: calc(100dvh - 2rem);
	}

	/* Sin soporte de popover el contenedor es un bloque fijo normal y siempre se pinta. */
	.toast-region:not([popover]),
	.toast-region:popover-open {
		display: flex;
	}

	@supports not selector(:popover-open) {
		.toast-region {
			display: flex;
		}
	}

	.toast-item {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		border: 1px solid var(--color-gray-200, #e5e7eb);
		border-left-width: 4px;
		border-left-color: var(--color-blue-600, #2563eb);
		border-radius: 0.75rem;
		background: var(--color-white, #fff);
		padding: 0.75rem;
		color: var(--color-gray-900, #111827);
		font-size: 0.875rem;
		line-height: 1.4;
		box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.25);
	}

	.toast-success {
		border-left-color: var(--color-green-600, #16a34a);
	}

	.toast-error {
		border-left-color: var(--color-red-600, #dc2626);
	}

	.toast-icon {
		flex-shrink: 0;
		margin-top: 0.0625rem;
		color: var(--color-blue-700, #1d4ed8);
	}

	.toast-success .toast-icon {
		color: var(--color-green-700, #15803d);
	}

	.toast-error .toast-icon {
		color: var(--color-red-700, #b91c1c);
	}

	.toast-text {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.toast-close {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.75rem;
		min-height: 1.75rem;
		border-radius: 0.5rem;
		color: var(--color-gray-600, #4b5563);
	}

	.toast-close:hover {
		background: var(--color-gray-100, #f3f4f6);
	}

	:global(.dark) .toast-item {
		border-color: var(--color-gray-700, #374151);
		border-left-color: var(--color-blue-400, #60a5fa);
		background: var(--color-gray-800, #1f2937);
		color: var(--color-gray-100, #f3f4f6);
	}

	:global(.dark) .toast-success {
		border-left-color: var(--color-green-400, #4ade80);
	}

	:global(.dark) .toast-error {
		border-left-color: var(--color-red-400, #f87171);
	}

	:global(.dark) .toast-icon {
		color: var(--color-blue-300, #93c5fd);
	}

	:global(.dark) .toast-success .toast-icon {
		color: var(--color-green-300, #86efac);
	}

	:global(.dark) .toast-error .toast-icon {
		color: var(--color-red-300, #fca5a5);
	}

	:global(.dark) .toast-close {
		color: var(--color-gray-300, #d1d5db);
	}

	:global(.dark) .toast-close:hover {
		background: var(--color-gray-700, #374151);
	}

	@media (pointer: coarse) {
		.toast-close {
			min-width: 2.75rem;
			min-height: 2.75rem;
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		.toast-item {
			animation: toast-in 180ms ease-out;
		}
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(0.5rem);
		}
	}
</style>
