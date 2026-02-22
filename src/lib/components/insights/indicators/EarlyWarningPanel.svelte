<script lang="ts">
    import { Card, Button } from 'flowbite-svelte';
    import RiskIndicator from './RiskIndicator.svelte';
    import { formatDistanceToNow } from 'date-fns';
    import { es } from 'date-fns/locale';
    import { Mail, Calendar, ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from 'lucide-svelte';
    import type { StudentAtRisk, RiskLevel } from '$lib/types/insights';

    interface Props {
        studentsAtRisk: StudentAtRisk[];
        riskDistribution: {
            high: number;
            medium: number;
            low: number;
        };
    }

    let { studentsAtRisk, riskDistribution }: Props = $props();

    let activeFilter = $state<RiskLevel | 'all'>('all');
    let expandedStudentId = $state<string | null>(null);

    let filteredStudents = $derived(() => {
        if (activeFilter === 'all') return studentsAtRisk;
        return studentsAtRisk.filter(s => s.student.metrics.riskLevel === activeFilter);
    });

    function toggleExpand(studentId: string) {
        expandedStudentId = expandedStudentId === studentId ? null : studentId;
    }

    function getLastActivityText(lastActivityAt: string | null): string {
        if (!lastActivityAt) return 'Sin actividad registrada';
        try {
            return formatDistanceToNow(new Date(lastActivityAt), {
                addSuffix: true,
                locale: es
            });
        } catch {
            return 'Fecha desconocida';
        }
    }

    const filterButtons: { id: RiskLevel | 'all'; label: string; count: number }[] = $derived([
        { id: 'all', label: 'Todos', count: studentsAtRisk.length },
        { id: 'high', label: 'Alto', count: riskDistribution.high },
        { id: 'medium', label: 'Medio', count: riskDistribution.medium }
    ]);
</script>

<div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <AlertTriangle size={24} class="text-yellow-500" />
                Alertas Tempranas
            </h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">
                Estudiantes que requieren atencion inmediata
            </p>
        </div>

        <!-- Risk Summary -->
        <div class="flex gap-3">
            <div class="text-center px-4 py-2 rounded-xl bg-red-50 dark:bg-red-900/20">
                <p class="text-2xl font-bold text-red-600 dark:text-red-400">{riskDistribution.high}</p>
                <p class="text-xs text-red-600 dark:text-red-400">Alto riesgo</p>
            </div>
            <div class="text-center px-4 py-2 rounded-xl bg-yellow-50 dark:bg-yellow-900/20">
                <p class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{riskDistribution.medium}</p>
                <p class="text-xs text-yellow-600 dark:text-yellow-400">Riesgo medio</p>
            </div>
            <div class="text-center px-4 py-2 rounded-xl bg-green-50 dark:bg-green-900/20">
                <p class="text-2xl font-bold text-green-600 dark:text-green-400">{riskDistribution.low}</p>
                <p class="text-xs text-green-600 dark:text-green-400">Bajo riesgo</p>
            </div>
        </div>
    </div>

    <!-- Filters -->
    <div class="flex gap-2">
        {#each filterButtons as btn}
            <button
                onclick={() => activeFilter = btn.id}
                class="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
                    {activeFilter === btn.id
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}"
            >
                {btn.label} ({btn.count})
            </button>
        {/each}
    </div>

    <!-- Students List -->
    {#if filteredStudents().length === 0}
        <Card class="p-8 text-center">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                <CheckCircle size={32} class="text-green-500" />
            </div>
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No hay alertas
            </h3>
            <p class="text-gray-500 dark:text-gray-400">
                {#if activeFilter === 'all'}
                    Todos los estudiantes estan progresando adecuadamente.
                {:else}
                    No hay estudiantes con riesgo {activeFilter === 'high' ? 'alto' : 'medio'}.
                {/if}
            </p>
        </Card>
    {:else}
        <div class="space-y-3">
            {#each filteredStudents() as studentRisk (studentRisk.student.id)}
                <Card class="overflow-hidden">
                    <!-- Student Header -->
                    <button
                        class="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        onclick={() => toggleExpand(studentRisk.student.id)}
                    >
                        <div class="flex items-center gap-3">
                            <RiskIndicator level={studentRisk.student.metrics.riskLevel} />
                            <div>
                                <h4 class="font-semibold text-gray-900 dark:text-white">
                                    {studentRisk.student.username}
                                </h4>
                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                    {studentRisk.student.email}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="text-right text-sm">
                                <p class="text-gray-600 dark:text-gray-400">
                                    {studentRisk.student.metrics.totalMessages} mensajes
                                </p>
                                <p class="text-gray-400 dark:text-gray-500 text-xs">
                                    {getLastActivityText(studentRisk.student.metrics.lastActivityAt)}
                                </p>
                            </div>
                            {#if expandedStudentId === studentRisk.student.id}
                                <ChevronUp size={20} class="text-gray-400" />
                            {:else}
                                <ChevronDown size={20} class="text-gray-400" />
                            {/if}
                        </div>
                    </button>

                    <!-- Expanded Details -->
                    {#if expandedStudentId === studentRisk.student.id}
                        <div class="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
                            <!-- Risk Factors -->
                            <div class="mt-4">
                                <h5 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    Factores de Riesgo
                                </h5>
                                <div class="space-y-2">
                                    {#each studentRisk.riskFactors as factor}
                                        <div class="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                                            <span class="w-2 h-2 rounded-full {factor.severity === 'high' ? 'bg-red-500' : factor.severity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}"></span>
                                            <span class="text-sm text-gray-700 dark:text-gray-300">
                                                {factor.description}
                                            </span>
                                        </div>
                                    {/each}
                                </div>
                            </div>

                            <!-- Recommended Actions -->
                            <div class="mt-4">
                                <h5 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    Acciones Recomendadas
                                </h5>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {#each studentRisk.recommendedActions as action}
                                        <div class="flex items-center gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                                            <CheckCircle size={16} />
                                            <span class="text-sm">{action}</span>
                                        </div>
                                    {/each}
                                </div>
                            </div>

                            <!-- Quick Actions -->
                            <div class="mt-4 flex gap-2">
                                <Button color="blue" size="sm" class="gap-1">
                                    <Mail size={14} />
                                    Enviar email
                                </Button>
                                <Button color="light" size="sm" class="gap-1">
                                    <Calendar size={14} />
                                    Programar tutoria
                                </Button>
                            </div>
                        </div>
                    {/if}
                </Card>
            {/each}
        </div>
    {/if}
</div>
