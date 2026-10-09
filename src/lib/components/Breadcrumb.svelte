<script lang="ts">
	import { resolve } from '$app/paths';
	import type { BreadcrumbItem } from '$lib/types/navigation';
	export let items: BreadcrumbItem[] = [];
</script>

<nav class="mb-4 text-sm" aria-label="Breadcrumb">
	<ol class="inline-flex list-none p-0">
		{#each items as item, index}
			<li class="flex items-center">
				{#if index > 0}
					<span class="mx-2 text-gray-400">/</span>
				{/if}
				{#if item.href}
					<a
						href={resolve(...([item.href] as Parameters<typeof resolve>))}
						class="text-blue-600 hover:text-blue-800">{item.label}</a
					>
				{:else}
					<span class="text-gray-500">{item.label}</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
