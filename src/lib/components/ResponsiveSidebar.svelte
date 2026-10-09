<script lang="ts">
	import { Sidebar } from 'flowbite-svelte';
	import type { ComponentProps } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';

	let {
		children,
		isOpen = false,
		closeSidebar,
		id = 'context-sidebar',
		...props
	}: ComponentProps<typeof Sidebar> = $props();
	const desktop = new MediaQuery('(min-width: 1024px)', false);
	const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)', false);

	// Reset the mobile drawer when the viewport switches to the persistent desktop navigation.
	$effect(() => {
		if (desktop.current && isOpen) closeSidebar?.();
	});
</script>

<!-- CSS makes the desktop navigation available before hydration. -->
<div class="hidden lg:contents">
	<Sidebar
		{...props}
		id={`${id}-desktop`}
		alwaysOpen
		{closeSidebar}
		transition={() => ({ duration: 0 })}
	>
		{@render children()}
	</Sidebar>
</div>

<!-- Keep Flowbite's focus trap, Escape and outside-click handling on mobile. -->
{#if !desktop.current}
	<div class="lg:hidden">
		<Sidebar
			{...props}
			{id}
			{isOpen}
			{closeSidebar}
			breakpoint="lg"
			params={{ x: -320, duration: reducedMotion.current ? 0 : 200 }}
		>
			{@render children()}
		</Sidebar>
	</div>
{/if}
