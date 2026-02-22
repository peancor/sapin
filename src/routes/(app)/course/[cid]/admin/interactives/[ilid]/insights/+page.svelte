<script lang="ts">
    import { onMount } from 'svelte';
    import { beforeNavigate } from '$app/navigation';
    import type { PageData } from './$types';
    import {
        InsightsLayout,
        OverviewPanel,
        StudentSelector,
        GeneratorPanel,
        StreamingDisplay,
        ReportViewer,
        EarlyWarningPanel
    } from '$lib/components/insights';
    import { insightsStore, selectedStudents } from '$lib/stores/insights';
    import type { ConsolidatedMetrics, StudentAtRisk, RiskFactor } from '$lib/types/insights';

    let { data }: { data: PageData } = $props();

    // Subscribe to store state
    let storeState = $derived($insightsStore);
    let selectedStudentsList = $derived($selectedStudents);

    // Calculate consolidated metrics from students data
    function calculateMetrics(): ConsolidatedMetrics | null {
        if (!data.students || data.students.length === 0) return null;

        const students = data.students;
        const totalStudents = students.length;

        // Calculate risk distribution
        const riskDistribution = {
            high: students.filter(s => s.metrics.riskLevel === 'high').length,
            medium: students.filter(s => s.metrics.riskLevel === 'medium').length,
            low: students.filter(s => s.metrics.riskLevel === 'low').length
        };

        // Calculate participation
        const participation = {
            completed: students.filter(s => s.metrics.completionStatus === 'completed').length,
            inProgress: students.filter(s => s.metrics.completionStatus === 'in_progress').length,
            notStarted: students.filter(s => s.metrics.completionStatus === 'not_started').length
        };

        // Calculate engagement
        const activeStudents = students.filter(s => s.metrics.totalMessages > 0);
        const overallScore = activeStudents.length > 0
            ? Math.round(activeStudents.reduce((sum, s) => sum + (s.metrics.engagementScore || 0), 0) / activeStudents.length)
            : 0;
        const participationRate = Math.round((activeStudents.length / Math.max(totalStudents, 1)) * 100);

        // Build students at risk list
        const studentsAtRisk: StudentAtRisk[] = students
            .filter(s => s.metrics.riskLevel === 'high' || s.metrics.riskLevel === 'medium')
            .map(s => {
                const riskFactors: RiskFactor[] = [];

                if (s.metrics.totalMessages === 0) {
                    riskFactors.push({
                        type: 'no_activity',
                        description: 'Sin actividad registrada',
                        severity: 'high'
                    });
                } else {
                    if (s.metrics.lastActivityAt) {
                        const daysSince = (Date.now() - new Date(s.metrics.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24);
                        if (daysSince > 3) {
                            riskFactors.push({
                                type: 'no_activity',
                                description: `Sin actividad hace ${Math.round(daysSince)} dias`,
                                severity: daysSince > 7 ? 'high' : 'medium'
                            });
                        }
                    }

                    if ((s.metrics.engagementScore || 0) < 50) {
                        riskFactors.push({
                            type: 'low_engagement',
                            description: `Engagement bajo (${s.metrics.engagementScore}%)`,
                            severity: (s.metrics.engagementScore || 0) < 30 ? 'high' : 'medium'
                        });
                    }

                    if (s.metrics.completionStatus !== 'completed') {
                        riskFactors.push({
                            type: 'incomplete',
                            description: 'Actividad no completada',
                            severity: 'medium'
                        });
                    }
                }

                const recommendedActions: string[] = [];
                if (riskFactors.some(f => f.type === 'no_activity' && f.severity === 'high')) {
                    recommendedActions.push('Contactar via email urgente');
                    recommendedActions.push('Programar tutoria individual');
                }
                if (riskFactors.some(f => f.type === 'low_engagement')) {
                    recommendedActions.push('Revisar si hay dificultades tecnicas');
                    recommendedActions.push('Ofrecer recursos adicionales');
                }
                if (riskFactors.some(f => f.type === 'incomplete')) {
                    recommendedActions.push('Verificar comprension del ejercicio');
                }

                return {
                    student: s,
                    riskFactors,
                    recommendedActions: [...new Set(recommendedActions)]
                };
            });

        // Sort by total messages for top performers
        const sortedByEngagement = [...students].sort((a, b) =>
            (b.metrics.engagementScore || 0) - (a.metrics.engagementScore || 0)
        );
        const topPerformers = sortedByEngagement.slice(0, 3).map(s => s.username);
        const strugglingStudents = sortedByEngagement
            .slice(-3)
            .filter(s => (s.metrics.engagementScore || 0) < 50)
            .map(s => s.username);

        return {
            engagement: {
                overallScore,
                participationRate,
                averageSessionDuration: 0,
                messageFrequency: data.chatStats.averageMessagesPerChat,
                activeStudentsCount: activeStudents.length,
                inactiveStudentsCount: totalStudents - activeStudents.length
            },
            performance: {
                averageCompletionRate: Math.round((participation.completed / Math.max(totalStudents, 1)) * 100),
                averageMessageQuality: 0,
                topPerformers,
                strugglingStudents
            },
            earlyWarning: {
                studentsAtRisk,
                totalAtRisk: studentsAtRisk.length,
                riskDistribution
            },
            participation
        };
    }

    let consolidatedMetrics = $derived(calculateMetrics());

    // Initialize store on mount
    onMount(() => {
        insightsStore.init(
            data.interactiveChat.interactive_learning.id,
            data.students,
            consolidatedMetrics
        );

        // Add beforeunload warning during generation
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (storeState.isGenerating) {
                event.preventDefault();
                event.returnValue = 'La generacion del informe esta en curso y se perdera el progreso.';
                return event.returnValue;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    });

    // Handle internal navigation during generation
    beforeNavigate(({ cancel }) => {
        if (storeState.isGenerating) {
            if (!confirm('La generacion del informe esta en curso. Seguro que deseas salir?')) {
                cancel();
            }
        }
    });
</script>

<InsightsLayout
    activityName={data.interactiveChat.interactive_learning.name}
    courseId={data.courseId}
    ilid={data.interactiveChat.interactive_learning.id}
    activeView={storeState.activeView}
    hasReport={!!storeState.report.content}
    studentsAtRiskCount={consolidatedMetrics?.earlyWarning.totalAtRisk || 0}
    isGenerating={storeState.isGenerating}
>
    {#if storeState.activeView === 'overview'}
        <OverviewPanel
            chatStats={data.chatStats}
            metrics={consolidatedMetrics}
            activityContext={data.activityContext}
        />
    {:else if storeState.activeView === 'students'}
        <StudentSelector
            students={data.students}
            selectedIds={storeState.selectedStudentIds}
        />
    {:else if storeState.activeView === 'generate'}
        <GeneratorPanel
            models={data.enabledModels}
            defaultModel={data.defaultModel}
            selectedStudents={selectedStudentsList}
            ilid={data.interactiveChat.interactive_learning.id}
        />
    {:else if storeState.activeView === 'streaming'}
        <StreamingDisplay
            content={storeState.streamingContent}
            progress={storeState.streamingProgress}
            currentPhase={storeState.currentPhase}
        />
    {:else if storeState.activeView === 'report'}
        <ReportViewer
            content={storeState.report.content}
            generatedAt={storeState.report.generatedAt}
            activityName={data.interactiveChat.interactive_learning.name}
            ilid={data.interactiveChat.interactive_learning.id}
        />
    {:else if storeState.activeView === 'alerts'}
        {#if consolidatedMetrics}
            <EarlyWarningPanel
                studentsAtRisk={consolidatedMetrics.earlyWarning.studentsAtRisk}
                riskDistribution={consolidatedMetrics.earlyWarning.riskDistribution}
            />
        {:else}
            <div class="text-center py-12">
                <p class="text-gray-500 dark:text-gray-400">
                    No hay datos de alertas disponibles.
                </p>
            </div>
        {/if}
    {/if}
</InsightsLayout>
