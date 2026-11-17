<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { children }: { data: LayoutData; children: Snippet } = $props();
</script>

<svelte:head>
	<!-- Título por defecto; cada página puede definir el suyo y prevalece. -->
	<title>SAPIN</title>
</svelte:head>

{@render children()}
