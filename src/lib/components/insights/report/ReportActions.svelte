<script lang="ts">
    import { Button } from 'flowbite-svelte';
    import { Download, RefreshCw, Trash2 } from 'lucide-svelte';

    interface Props {
        onExportDocx: () => void;
        onExportMd: () => void;
        onRegenerate: () => void;
        onClearCache: () => void;
        isExporting: boolean;
        isExportingMd: boolean;
    }

    let {
        onExportDocx,
        onExportMd,
        onRegenerate,
        onClearCache,
        isExporting,
        isExportingMd
    }: Props = $props();
</script>

<div class="flex flex-wrap gap-2">
    <Button color="blue" size="sm" onclick={onExportDocx} disabled={isExporting}>
        {#if isExporting}
            <svg class="w-4 h-4 mr-2 animate-spin" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
        {:else}
            <Download size={16} class="mr-2" />
        {/if}
        DOCX
    </Button>

    <Button color="blue" size="sm" onclick={onExportMd} disabled={isExportingMd}>
        {#if isExportingMd}
            <svg class="w-4 h-4 mr-2 animate-spin" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
        {:else}
            <Download size={16} class="mr-2" />
        {/if}
        Markdown
    </Button>

    <Button color="light" size="sm" onclick={onRegenerate}>
        <RefreshCw size={16} class="mr-2" />
        Regenerar
    </Button>

    <Button color="light" size="sm" onclick={onClearCache}>
        <Trash2 size={16} class="mr-2" />
        Borrar cache
    </Button>
</div>
