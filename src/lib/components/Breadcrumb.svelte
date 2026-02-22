<script lang="ts">
    export let items: { label: string; href?: string }[] = [];
</script>

<nav class="mb-4 text-sm" aria-label="Breadcrumb">
    <ol class="list-none p-0 inline-flex">
        {#each items as item, index}
            <li class="flex items-center">
                {#if index > 0}
                    <span class="mx-2 text-gray-400">/</span>
                {/if}
                {#if item.href}
                    <a href={item.href} class="text-blue-600 hover:text-blue-800">{item.label}</a>
                {:else}
                    <span class="text-gray-500">{item.label}</span>
                {/if}
            </li>
        {/each}
    </ol>
</nav>
