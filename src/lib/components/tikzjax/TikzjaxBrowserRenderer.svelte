<script lang="ts">
	import { onMount } from 'svelte';
	import type { TikzjaxBrowserRenderRequest } from '$lib/types/tikzjax';
	import {
		getTikzjaxRuntimeBasePath,
		loadTikzjaxBrowserRuntime
	} from '$lib/utils/tikzjaxBrowserRuntime';

	interface Props {
		request: TikzjaxBrowserRenderRequest | null;
		renderKey?: string | number;
		runtimeReady?: boolean;
		onRuntimeReady?: () => void;
		onRuntimeError?: (error: Error) => void;
		onRenderFinished?: () => void;
		containerClass?: string;
		hostClass?: string;
		placeholderClass?: string;
		idleMessage?: string;
		loadingMessage?: string;
	}

	let {
		request,
		renderKey = 0,
		runtimeReady = $bindable(false),
		onRuntimeReady,
		onRuntimeError,
		onRenderFinished,
		containerClass = 'mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-6',
		hostClass = 'tikzjax-scaled-container mx-auto min-h-56 max-w-4xl',
		placeholderClass = 'flex min-h-56 items-center justify-center text-sm text-slate-500',
		idleMessage = 'Pulsa Renderizar En Cliente para generar el SVG.',
		loadingMessage = 'Cargando runtime de TikZJax...'
	}: Props = $props();

	const tikzjaxRuntimeBasePath = getTikzjaxRuntimeBasePath();
	let renderHost = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!renderHost) {
			return;
		}

		const handleTikzRenderFinished = () => {
			onRenderFinished?.();
		};

		renderHost.addEventListener('tikzjax-load-finished', handleTikzRenderFinished);

		return () => {
			renderHost?.removeEventListener('tikzjax-load-finished', handleTikzRenderFinished);
		};
	});

	onMount(() => {
		void loadTikzjaxBrowserRuntime()
			.then(() => {
				runtimeReady = true;
				onRuntimeReady?.();
			})
			.catch((error) => {
				onRuntimeError?.(
					error instanceof Error ? error : new Error('No se pudo cargar TikZJax en el navegador.')
				);
			});
	});
</script>

<svelte:head>
	<link rel="stylesheet" href={`${tikzjaxRuntimeBasePath}/fonts.css`} />
</svelte:head>

<div class={containerClass}>
	{#if runtimeReady && request}
		{#key renderKey}
			<div bind:this={renderHost} class={hostClass}>
				<svelte:element
					this={'script'}
					type="text/tikz"
					data-aria-label={request.ariaLabel}
					data-width={request.width}
					data-height={request.height}
					data-show-console={String(request.showConsole)}
					data-disable-cache={String(request.disableCache)}
					data-tex-packages={request.texPackagesJson || undefined}
					data-tikz-libraries={request.tikzLibraries || undefined}
					data-add-to-preamble={request.addToPreamble || undefined}
				>{request.source}</svelte:element>
			</div>
		{/key}
	{:else}
		<div class={placeholderClass}>
			{runtimeReady ? idleMessage : loadingMessage}
		</div>
	{/if}
</div>