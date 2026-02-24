<script lang="ts">
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const { analytics } = data;

    const totalToolCalls = analytics.toolStats.reduce((s, t) => s + t.total, 0);
    const successRate = totalToolCalls > 0
        ? Math.round((analytics.toolStats.reduce((s, t) => s + (t.completed ?? 0), 0) / totalToolCalls) * 100)
        : 0;
</script>

<div class="space-y-6">
    <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Analítica del Sistema Agéntico</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Métricas globales de uso del motor agéntico.</p>
    </div>

    <!-- Overview cards -->
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4">
            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Sesiones</p>
            <p class="text-3xl font-bold text-gray-900 dark:text-white mt-1">{analytics.sessions}</p>
        </div>
        <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4">
            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Mensajes</p>
            <p class="text-3xl font-bold text-gray-900 dark:text-white mt-1">{analytics.messages}</p>
        </div>
        <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4">
            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Llamadas a herramientas</p>
            <p class="text-3xl font-bold text-gray-900 dark:text-white mt-1">{totalToolCalls}</p>
            {#if totalToolCalls > 0}
                <p class="text-xs text-green-600 dark:text-green-400 mt-0.5">{successRate}% exitosas</p>
            {/if}
        </div>
        <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4">
            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">HITL aceptadas</p>
            <p class="text-3xl font-bold text-gray-900 dark:text-white mt-1">{analytics.hitl.acceptanceRate}%</p>
            <p class="text-xs text-gray-400 mt-0.5">{analytics.hitl.confirmed} / {analytics.hitl.total} confirmadas</p>
        </div>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <!-- Tool usage table -->
        <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Uso de Herramientas</h2>
            </div>
            {#if analytics.toolStats.length === 0}
                <p class="px-4 py-8 text-center text-sm text-gray-400">Sin datos aún.</p>
            {:else}
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Herramienta</th>
                            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">Éxito</th>
                            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">Rechazadas</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                        {#each analytics.toolStats as t}
                            {@const successPct = t.total > 0 ? Math.round(((t.completed ?? 0) / t.total) * 100) : 0}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td class="px-4 py-2.5">
                                    <span class="font-medium text-gray-800 dark:text-gray-200">
                                        {t.displayName ?? t.toolName}
                                    </span>
                                    <span class="ml-1.5 text-xs text-gray-400 font-mono">{t.toolName}</span>
                                </td>
                                <td class="px-4 py-2.5 text-right font-medium text-gray-700 dark:text-gray-300">{t.total}</td>
                                <td class="px-4 py-2.5 text-right">
                                    <span class="text-xs {successPct >= 80 ? 'text-green-600 dark:text-green-400' : 'text-orange-500 dark:text-orange-400'}">
                                        {successPct}%
                                    </span>
                                </td>
                                <td class="px-4 py-2.5 text-right text-xs text-gray-400">
                                    {t.rejected ?? 0}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        </div>

        <!-- UI Component stats -->
        <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Componentes UI Interactivos</h2>
            </div>
            {#if analytics.uiStats.length === 0}
                <p class="px-4 py-8 text-center text-sm text-gray-400">Sin datos aún.</p>
            {:else}
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Componente</th>
                            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">Instancias</th>
                            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">Respondidas</th>
                            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">Score prom.</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                        {#each analytics.uiStats as u}
                            {@const responsePct = u.total > 0 ? Math.round(((u.responded ?? 0) / u.total) * 100) : 0}
                            {@const avgScorePct = u.avgScore != null ? Math.round(Number(u.avgScore) * 100) : null}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td class="px-4 py-2.5">
                                    <span class="font-medium text-gray-800 dark:text-gray-200">
                                        {u.displayName ?? u.componentKey}
                                    </span>
                                </td>
                                <td class="px-4 py-2.5 text-right font-medium text-gray-700 dark:text-gray-300">{u.total}</td>
                                <td class="px-4 py-2.5 text-right text-xs text-gray-500">{responsePct}%</td>
                                <td class="px-4 py-2.5 text-right">
                                    {#if avgScorePct != null}
                                        <span class="text-xs font-medium {avgScorePct >= 70 ? 'text-green-600 dark:text-green-400' : 'text-orange-500'}">
                                            {avgScorePct}%
                                        </span>
                                    {:else}
                                        <span class="text-xs text-gray-400">—</span>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        </div>
    </div>

    {#if analytics.hitl.total > 0}
        <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4">
            <h2 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Detalle HITL (Human-in-the-Loop)</h2>
            <div class="flex gap-6 text-sm">
                <div>
                    <span class="text-gray-500">Total HITL requeridas:</span>
                    <span class="ml-2 font-medium text-gray-900 dark:text-white">{analytics.hitl.total}</span>
                </div>
                <div>
                    <span class="text-gray-500">Confirmadas:</span>
                    <span class="ml-2 font-medium text-green-600 dark:text-green-400">{analytics.hitl.confirmed}</span>
                </div>
                <div>
                    <span class="text-gray-500">Rechazadas:</span>
                    <span class="ml-2 font-medium text-red-600 dark:text-red-400">{analytics.hitl.rejected}</span>
                </div>
                <div>
                    <span class="text-gray-500">Tasa de aceptación:</span>
                    <span class="ml-2 font-medium text-gray-900 dark:text-white">{analytics.hitl.acceptanceRate}%</span>
                </div>
            </div>
        </div>
    {/if}
</div>
