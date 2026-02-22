<script lang="ts">
	import { onDestroy, onMount, type Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { HardHat } from 'lucide-svelte';
	import { Breadcrumb, BreadcrumbItem } from 'flowbite-svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<div class="mx-auto max-w-screen-2xl px-4 py-3">
	<Breadcrumb aria-label="Breadcrumb" class="py-2">
		<BreadcrumbItem href="/" home>Inicio</BreadcrumbItem>
		<BreadcrumbItem href="/teacher">Cursos</BreadcrumbItem>
	</Breadcrumb>
</div>
{@render children()}
