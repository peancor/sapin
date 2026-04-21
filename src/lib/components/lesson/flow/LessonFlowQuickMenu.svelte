<script lang="ts">
	import { tick } from 'svelte';
	import type { LessonFlowQuickMenuItem } from '$lib/lesson/lessonFlowQuickMenu';

	let {
		open = false,
		x = 24,
		y = 24,
		title = 'Acciones rapidas',
		subtitle = '',
		query = '',
		items = [],
		onselect = (_itemId: string) => {},
		onclose = () => {},
		onquerychange = (_value: string) => {}
	}: {
		open?: boolean;
		x?: number;
		y?: number;
		title?: string;
		subtitle?: string;
		query?: string;
		items?: LessonFlowQuickMenuItem[];
		onselect?: (itemId: string) => void;
		onclose?: () => void;
		onquerychange?: (value: string) => void;
	} = $props();

	let inputElement: HTMLInputElement | null = $state.raw(null);
	let activeIndex = $state(0);

	const filteredItems = $derived.by(() => {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) return items;

		return items.filter((item) => {
			const haystack = [item.label, item.description ?? '', ...(item.keywords ?? [])]
				.join(' ')
				.toLowerCase();
			return haystack.includes(normalizedQuery);
		});
	});

	function menuWidth() {
		return 360;
	}

	function panelStyle() {
		return `left:clamp(1rem, ${x}px, calc(100% - ${menuWidth()}px - 1rem));top:clamp(1rem, ${y}px, calc(100% - 20rem));`;
	}

	function toneClass(item: LessonFlowQuickMenuItem) {
		if (item.disabled) {
			return 'border-stone-200 bg-stone-100/80 text-stone-400 dark:border-stone-800 dark:bg-stone-900/70 dark:text-stone-600';
		}

		if (item.tone === 'danger') {
			return 'border-red-200/80 bg-red-50/80 text-red-700 hover:border-red-300 hover:bg-red-100/80 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200 dark:hover:bg-red-950/35';
		}

		if (item.tone === 'accent') {
			return 'border-amber-200/80 bg-amber-50/80 text-amber-800 hover:border-amber-300 hover:bg-amber-100/80 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-950/35';
		}

		return 'border-stone-200/90 bg-white/92 text-stone-700 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-950/85 dark:text-stone-200 dark:hover:bg-stone-900';
	}

	async function focusInput() {
		await tick();
		inputElement?.focus();
		inputElement?.select();
	}

	function selectItem(item: LessonFlowQuickMenuItem | undefined) {
		if (!item || item.disabled) return;
		onselect(item.id);
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (!open) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (filteredItems.length === 0) return;
			activeIndex = (activeIndex + 1) % filteredItems.length;
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (filteredItems.length === 0) return;
			activeIndex = (activeIndex - 1 + filteredItems.length) % filteredItems.length;
			return;
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			selectItem(filteredItems[activeIndex]);
		}
	}

	$effect(() => {
		if (!open) {
			activeIndex = 0;
			return;
		}

		focusInput();
		activeIndex = 0;
	});

	$effect(() => {
		if (!open) return;
		if (filteredItems.length === 0) {
			activeIndex = 0;
			return;
		}

		if (activeIndex > filteredItems.length - 1) {
			activeIndex = filteredItems.length - 1;
		}
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if open}
	<div class="absolute inset-0 z-40" role="presentation">
		<button
			type="button"
			class="absolute inset-0 h-full w-full cursor-default bg-transparent"
			aria-label="Cerrar menu rapido"
			onclick={onclose}
		></button>

		<div
			class="absolute w-[min(22rem,calc(100%-1.5rem))] overflow-hidden rounded-2xl border border-stone-200/80 bg-[#fdfaf4]/97 shadow-[0_28px_80px_-36px_rgba(24,24,27,0.78)] backdrop-blur-xl dark:border-stone-700/80 dark:bg-[#17191c]/97"
			style={panelStyle()}
			role="dialog"
			tabindex="-1"
			aria-label={title}
			oncontextmenu={(event) => {
				event.preventDefault();
			}}
		>
			<div class="border-b border-stone-200/70 px-4 py-3 dark:border-stone-800">
				<p class="text-[9px] font-bold tracking-[0.26em] text-stone-400 uppercase dark:text-stone-500">{title}</p>
				{#if subtitle}
					<p class="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{subtitle}</p>
				{/if}
				<input
					bind:this={inputElement}
					value={query}
					class="mt-2.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-hidden shadow-sm transition placeholder:text-stone-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 dark:border-stone-700 dark:bg-stone-950 dark:text-white dark:placeholder:text-stone-500 dark:focus:border-amber-600"
					placeholder="Buscar acción o tipo de bloque…"
					oninput={(event) => onquerychange((event.currentTarget as HTMLInputElement).value)}
				/>
			</div>

			<div class="max-h-[18rem] overflow-y-auto px-2.5 py-2.5">
				{#if filteredItems.length > 0}
					<div class="space-y-1.5" role="listbox" aria-label={title}>
						{#each filteredItems as item, index (item.id)}
							<button
								type="button"
							class={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition active:scale-98 ${toneClass(item)} ${index === activeIndex && !item.disabled ? 'ring-2 ring-amber-300/80 ring-offset-1 ring-offset-transparent dark:ring-amber-700/60' : ''}`}
								role="option"
								aria-selected={index === activeIndex}
								disabled={item.disabled}
								onmouseenter={() => {
									activeIndex = index;
								}}
								onclick={() => {
									selectItem(item);
								}}
							>
								<div class="min-w-0">
									<p class="text-sm font-semibold">{item.label}</p>
									{#if item.description}
										<p class="mt-1 text-xs leading-5 opacity-80">{item.description}</p>
									{/if}
								</div>
								{#if item.shortcut}
									<span
										class="shrink-0 rounded-full border border-current/20 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] uppercase opacity-80"
									>
										{item.shortcut}
									</span>
								{/if}
							</button>
						{/each}
					</div>
				{:else}
					<div class="px-2 py-6 text-center text-xs text-stone-400 dark:text-stone-500">
						Sin coincidencias para «{query}»
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
