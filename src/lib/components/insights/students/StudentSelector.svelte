<script lang="ts">
    import { Button, Card } from 'flowbite-svelte';
    import StudentCard from './StudentCard.svelte';
    import StudentSearch from './StudentSearch.svelte';
    import { insightsStore } from '$lib/stores/insights';
    import { Users, UserCheck, AlertTriangle, X } from 'lucide-svelte';
    import type { StudentData } from '$lib/types/insights';

    interface Props {
        students: StudentData[];
        selectedIds: string[];
    }

    let { students, selectedIds }: Props = $props();

    let searchQuery = $state('');
    let activeFilter = $state<'all' | 'active' | 'at_risk'>('all');

    // Filtered students based on search and filter
    let filteredStudents = $derived(() => {
        let result = students;

        // Apply filter
        switch (activeFilter) {
            case 'active':
                result = result.filter(s => s.metrics.completionStatus !== 'not_started');
                break;
            case 'at_risk':
                result = result.filter(s => s.metrics.riskLevel === 'high' || s.metrics.riskLevel === 'medium');
                break;
        }

        // Apply search
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(s =>
                s.username.toLowerCase().includes(query) ||
                s.email.toLowerCase().includes(query) ||
                (s.alias && s.alias.toLowerCase().includes(query))
            );
        }

        return result;
    });

    // Selected students details
    let selectedStudents = $derived(
        students.filter(s => selectedIds.includes(s.id))
    );

    function handleFilterClick(filter: 'all' | 'active' | 'at_risk') {
        activeFilter = filter;
    }

    function removeSelection(studentId: string) {
        insightsStore.toggleStudent(studentId);
    }

    const filterButtons = [
        { id: 'all' as const, label: 'Todos', icon: Users },
        { id: 'active' as const, label: 'Activos', icon: UserCheck },
        { id: 'at_risk' as const, label: 'En riesgo', icon: AlertTriangle }
    ];
</script>

<div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                Seleccionar Estudiantes
            </h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">
                Elige estudiantes especificos para el analisis individual
            </p>
        </div>
        <div class="flex gap-2">
            <Button color="light" size="sm" onclick={() => insightsStore.selectAllStudents()}>
                Seleccionar todos
            </Button>
            <Button color="light" size="sm" onclick={() => insightsStore.clearSelection()}>
                Limpiar
            </Button>
        </div>
    </div>

    <!-- Selected Students Chips -->
    {#if selectedStudents.length > 0}
        <Card class="p-3">
            <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Seleccionados ({selectedStudents.length}):
                </span>
            </div>
            <div class="flex flex-wrap gap-2">
                {#each selectedStudents as student}
                    <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm
                        bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {student.alias || student.username}
                        <button
                            onclick={() => removeSelection(student.id)}
                            class="ml-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
                        >
                            <X size={14} />
                        </button>
                    </span>
                {/each}
            </div>
        </Card>
    {/if}

    <!-- Search and Filters -->
    <div class="flex flex-col sm:flex-row gap-4">
        <div class="flex-1">
            <StudentSearch value={searchQuery} onchange={(v) => searchQuery = v} />
        </div>
        <div class="flex gap-2">
            {#each filterButtons as btn}
                <button
                    onclick={() => handleFilterClick(btn.id)}
                    class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                        {activeFilter === btn.id
                            ? 'bg-blue-500 text-white shadow-md'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}"
                >
                    <svelte:component this={btn.icon} size={16} />
                    {btn.label}
                </button>
            {/each}
        </div>
    </div>

    <!-- Students Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each filteredStudents() as student (student.id)}
            <StudentCard
                {student}
                isSelected={selectedIds.includes(student.id)}
            />
        {/each}
    </div>

    <!-- Empty State -->
    {#if filteredStudents().length === 0}
        <div class="text-center py-12">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
                <Users size={32} class="text-gray-400" />
            </div>
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No se encontraron estudiantes
            </h3>
            <p class="text-gray-500 dark:text-gray-400">
                {#if searchQuery}
                    No hay estudiantes que coincidan con "{searchQuery}"
                {:else}
                    No hay estudiantes en la categoria seleccionada
                {/if}
            </p>
        </div>
    {/if}

    <!-- Summary -->
    <div class="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
        <div class="text-sm text-gray-600 dark:text-gray-400">
            Mostrando {filteredStudents().length} de {students.length} estudiantes
        </div>
        {#if selectedStudents.length > 0}
            <Button color="blue" onclick={() => insightsStore.setActiveView('generate')}>
                Continuar con {selectedStudents.length} estudiante{selectedStudents.length !== 1 ? 's' : ''}
            </Button>
        {/if}
    </div>
</div>
