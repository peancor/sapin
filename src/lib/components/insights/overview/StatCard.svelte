<script lang="ts">
    import type { ComponentType } from 'svelte';

    interface Props {
        title: string;
        value: string | number;
        subtitle?: string;
        icon?: ComponentType;
        trend?: 'up' | 'down' | 'neutral';
        trendValue?: string;
        color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo';
    }

    let {
        title,
        value,
        subtitle,
        icon,
        trend,
        trendValue,
        color = 'blue'
    }: Props = $props();

    const colorClasses = {
        blue: 'from-blue-500 to-blue-600',
        green: 'from-green-500 to-green-600',
        yellow: 'from-yellow-500 to-yellow-600',
        red: 'from-red-500 to-red-600',
        purple: 'from-purple-500 to-purple-600',
        indigo: 'from-indigo-500 to-indigo-600'
    };

    const iconBgClasses = {
        blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
        yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
        red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
        purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
        indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
    };
</script>

<div class="stat-card relative overflow-hidden rounded-xl border border-white/20 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm shadow-lg p-5 transition-all duration-300 hover:shadow-xl hover:scale-[1.02]">
    <!-- Gradient accent -->
    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r {colorClasses[color]}"></div>

    <div class="flex items-start justify-between">
        <div class="flex-1">
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {title}
            </p>
            <p class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {value}
            </p>
            {#if subtitle}
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {subtitle}
                </p>
            {/if}
            {#if trend && trendValue}
                <div class="mt-2 flex items-center gap-1">
                    {#if trend === 'up'}
                        <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                        </svg>
                        <span class="text-sm text-green-600 dark:text-green-400">{trendValue}</span>
                    {:else if trend === 'down'}
                        <svg class="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                        </svg>
                        <span class="text-sm text-red-600 dark:text-red-400">{trendValue}</span>
                    {:else}
                        <span class="text-sm text-gray-500 dark:text-gray-400">{trendValue}</span>
                    {/if}
                </div>
            {/if}
        </div>

        {#if icon}
            <div class="p-3 rounded-xl {iconBgClasses[color]}">
                <svelte:component this={icon} size={24} />
            </div>
        {/if}
    </div>
</div>
