<script lang="ts">
	import type { Component } from 'svelte';
	import {
		getUIComponentRegistryEntry,
		isImmersiveUIComponentEntry,
		type ImmersiveUIState
	} from './ui/registry';

	interface Props {
		instanceId: string;
		componentKey: string;
		props: Record<string, unknown>;
		interactive: boolean;
		initialUserResponse?: Record<string, unknown>;
		apiBase: string;
		onRespond?: (score?: number) => void;
		onResponsePersisted?: (payload: Record<string, unknown>) => void;
		onOpenImmersive?: () => void;
		onImmersiveStateChange?: (state: ImmersiveUIState) => void;
		renderMode?: 'inline' | 'immersive';
	}

	let {
		instanceId,
		componentKey,
		props,
		interactive,
		initialUserResponse,
		apiBase,
		onRespond,
		onResponsePersisted,
		onOpenImmersive,
		onImmersiveStateChange,
		renderMode = 'inline'
	}: Props = $props();

	let registryEntry = $derived(getUIComponentRegistryEntry(componentKey));
	let resolvedProps = $derived(
		registryEntry
			? registryEntry.buildProps({
					instanceId,
					props,
					interactive,
					initialUserResponse,
					apiBase,
					onRespond,
					onResponsePersisted,
					onImmersiveStateChange
				})
			: null
	);

	let ResolvedComponent = $derived(
		(() => {
			if (!registryEntry) return null;
			if (isImmersiveUIComponentEntry(registryEntry)) {
				return renderMode === 'immersive'
					? registryEntry.immersiveComponent
					: registryEntry.launcherComponent;
			}

			return registryEntry.component;
		})()
	);

	let ResolvedSvelteComponent = $derived(
		ResolvedComponent
			? (ResolvedComponent as unknown as Component<Record<string, unknown>>)
			: null
	);

	let resolvedComponentProps = $derived(
		resolvedProps
			? ({
					...(resolvedProps as Record<string, unknown>),
					...(registryEntry &&
					isImmersiveUIComponentEntry(registryEntry) &&
					renderMode === 'inline'
						? { onopen: onOpenImmersive }
						: {})
				} satisfies Record<string, unknown>)
			: null
	);
</script>

{#if ResolvedSvelteComponent && resolvedComponentProps}
	<ResolvedSvelteComponent {...resolvedComponentProps} />
{:else}
	<div
		class="my-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900"
	>
		<span class="font-medium">[{componentKey}]</span>
		<pre class="mt-1 overflow-auto text-xs">{JSON.stringify(props, null, 2)}</pre>
	</div>
{/if}
