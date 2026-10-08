<script lang="ts">
	import { Search, X } from 'lucide-svelte';

	interface Props {
		value: string;
		onchange: (value: string) => void;
		placeholder?: string;
	}

	let { value, onchange, placeholder = 'Buscar estudiantes...' }: Props = $props();

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		onchange(target.value);
	}

	function clearSearch() {
		onchange('');
	}
</script>

<div class="relative">
	<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
		<Search size={18} class="text-gray-400" />
	</div>
	<input
		type="text"
		{value}
		oninput={handleInput}
		{placeholder}
		class="w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-10 pl-10
            text-gray-900 placeholder-gray-400 transition-all duration-200
            focus:border-blue-500 focus:ring-2
            focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800
            dark:text-white dark:placeholder-gray-500"
	/>
	{#if value}
		<button
			onclick={clearSearch}
			class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
		>
			<X size={18} />
		</button>
	{/if}
</div>
