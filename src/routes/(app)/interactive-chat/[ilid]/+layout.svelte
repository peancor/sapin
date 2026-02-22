<script lang="ts">
    import { onMount, type Snippet } from 'svelte';
    import type { LayoutData } from './$types';
	import { navigationItems } from '$lib/stores/navigation';
    import { icons } from 'lucide-svelte';

    let { data, children }: { data: LayoutData, children: Snippet } = $props();
    

</script>

{@render children()}