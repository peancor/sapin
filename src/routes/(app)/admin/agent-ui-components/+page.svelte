<script lang="ts">
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const categoryLabel: Record<string, string> = {
        evaluation: 'Evaluación',
        practice: 'Práctica',
        visualization: 'Visualización'
    };

    const categoryColor: Record<string, string> = {
        evaluation: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
        practice: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
        visualization: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300'
    };
</script>

<div class="space-y-6">
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">Componentes UI Agent</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Catálogo de componentes interactivos que el agente puede generar en el chat.
            </p>
        </div>
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <table class="w-full text-sm">
            <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nombre</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Clave Frontend</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Categoría</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Estado</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Descripción</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                {#each data.components as comp}
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td class="px-4 py-3">
                            <div class="font-medium text-gray-900 dark:text-white">{comp.displayName}</div>
                            <div class="text-xs text-gray-400 font-mono">{comp.name}</div>
                        </td>
                        <td class="px-4 py-3">
                            <code class="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">
                                {comp.componentKey}
                            </code>
                        </td>
                        <td class="px-4 py-3">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                                {categoryColor[comp.category] ?? 'bg-gray-100 text-gray-700'}">
                                {categoryLabel[comp.category] ?? comp.category}
                            </span>
                        </td>
                        <td class="px-4 py-3">
                            <span class="inline-flex items-center gap-1 text-xs
                                {comp.isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}">
                                <span class="h-1.5 w-1.5 rounded-full {comp.isActive ? 'bg-green-500' : 'bg-gray-400'}"></span>
                                {comp.isActive ? 'Activo' : 'Inactivo'}
                                {#if comp.isSystem}
                                    <span class="ml-1 text-xs text-gray-400">(sistema)</span>
                                {/if}
                            </span>
                        </td>
                        <td class="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                            {comp.description}
                        </td>
                    </tr>
                {:else}
                    <tr>
                        <td colspan="5" class="px-4 py-8 text-center text-sm text-gray-400">
                            No hay componentes UI registrados.
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</div>
