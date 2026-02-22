<script lang="ts">
    import type { RiskLevel } from '$lib/types/insights';

    interface Props {
        level: RiskLevel;
        showLabel?: boolean;
        size?: 'sm' | 'md' | 'lg';
    }

    let { level, showLabel = true, size = 'md' }: Props = $props();

    const colors = {
        low: {
            bg: 'bg-green-100 dark:bg-green-900/30',
            text: 'text-green-700 dark:text-green-400',
            dot: 'bg-green-500'
        },
        medium: {
            bg: 'bg-yellow-100 dark:bg-yellow-900/30',
            text: 'text-yellow-700 dark:text-yellow-400',
            dot: 'bg-yellow-500'
        },
        high: {
            bg: 'bg-red-100 dark:bg-red-900/30',
            text: 'text-red-700 dark:text-red-400',
            dot: 'bg-red-500'
        }
    };

    const labels = {
        low: 'Bajo',
        medium: 'Medio',
        high: 'Alto'
    };

    const sizeClasses = {
        sm: {
            container: 'px-1.5 py-0.5 text-xs',
            dot: 'w-1.5 h-1.5'
        },
        md: {
            container: 'px-2 py-1 text-sm',
            dot: 'w-2 h-2'
        },
        lg: {
            container: 'px-3 py-1.5 text-base',
            dot: 'w-2.5 h-2.5'
        }
    };
</script>

<span class="inline-flex items-center gap-1.5 rounded-full font-medium {colors[level].bg} {colors[level].text} {sizeClasses[size].container}">
    <span class="rounded-full {colors[level].dot} {sizeClasses[size].dot}"></span>
    {#if showLabel}
        {labels[level]}
    {/if}
</span>
