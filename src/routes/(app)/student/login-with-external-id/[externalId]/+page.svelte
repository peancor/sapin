<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	onMount(() => {
		//invalidateAll();
		if (data.loginSuccess === true) {
			console.log('Login success with external ID');            
			setTimeout(() => {                
				goto('/student', {invalidateAll: true});
			}, 2000);
		}
	});
</script>

<div class="flex h-screen flex-col items-center justify-center gap-4">
	<div
		class="relative rounded border border-green-400 bg-green-100 px-4 py-3 text-green-700"
		role="alert"
	>
		<p class="font-bold">¡Login exitoso!</p>
		<p>Redirigiendo en unos segundos...</p>
	</div>
</div>
