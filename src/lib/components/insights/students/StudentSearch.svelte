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
    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search size={18} class="text-gray-400" />
    </div>
    <input
        type="text"
        {value}
        oninput={handleInput}
        {placeholder}
        class="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
            bg-white dark:bg-gray-800 text-gray-900 dark:text-white
            placeholder-gray-400 dark:placeholder-gray-500
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            transition-all duration-200"
    />
    {#if value}
        <button
            onclick={clearSearch}
            class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
            <X size={18} />
        </button>
    {/if}
</div>
