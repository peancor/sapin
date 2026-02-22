<script lang="ts">
    import { Button, Card, Textarea } from 'flowbite-svelte';
    import { Users, UserCheck, GitCompare, Zap, Cpu, Sliders, FileText } from 'lucide-svelte';
    import { insightsStore } from '$lib/stores/insights';
    import type { AnalysisMode, ReportOptions, StudentData } from '$lib/types/insights';

    interface Props {
        models: string[];
        defaultModel: string;
        selectedStudents: StudentData[];
        ilid: string;
    }

    let { models, defaultModel, selectedStudents, ilid }: Props = $props();

    let options = $state<ReportOptions>({
        analysisDepth: 'comprehensive',
        focusAreas: ['engagement', 'performance', 'difficulties'],
        includeExamples: true,
        model: defaultModel,
        customPrompt: '',
        detectAIUsage: false,
        temporalAnalysis: false,
        sentimentAnalysis: false,
        plagiarismDetection: false,
        skillsMapping: false,
        conceptMisconceptions: false,
        terminologyAnalysis: false,
        competencyLevels: false,
        teacherRecommendations: true,
        responseTimeAnalysis: false,
        cohortComparison: false,
        analysisMode: 'cohort',
        studentIds: [],
        includeComparison: false,
        generateCharts: true,
        includeEarlyWarning: true
    });

    let isGenerating = $state(false);

    const analysisModes: { id: AnalysisMode; label: string; description: string; icon: typeof Users }[] = [
        { id: 'cohort', label: 'Cohorte', description: 'Analiza todo el grupo', icon: Users },
        { id: 'individual', label: 'Individual', description: 'Estudiantes seleccionados', icon: UserCheck },
        { id: 'comparison', label: 'Comparativa', description: 'Compara entre si', icon: GitCompare }
    ];

    const analysisOptions = [
        { key: 'detectAIUsage' as const, label: 'Deteccion de IA', desc: 'Detecta uso de ChatGPT' },
        { key: 'temporalAnalysis' as const, label: 'Analisis temporal', desc: 'Progresion en el tiempo' },
        { key: 'sentimentAnalysis' as const, label: 'Sentimiento', desc: 'Tono emocional' },
        { key: 'plagiarismDetection' as const, label: 'Similitudes', desc: 'Respuestas parecidas' },
        { key: 'skillsMapping' as const, label: 'Habilidades', desc: 'Mapeo de competencias' },
        { key: 'conceptMisconceptions' as const, label: 'Conceptos erroneos', desc: 'Malentendidos' },
        { key: 'terminologyAnalysis' as const, label: 'Terminologia', desc: 'Uso tecnico' },
        { key: 'competencyLevels' as const, label: 'Niveles', desc: 'Inicial/Intermedio/Avanzado' },
        { key: 'teacherRecommendations' as const, label: 'Recomendaciones', desc: 'Sugerencias pedagogicas' },
        { key: 'responseTimeAnalysis' as const, label: 'Tiempos', desc: 'Tiempo de respuesta' },
        { key: 'includeEarlyWarning' as const, label: 'Alertas', desc: 'Estudiantes en riesgo' },
        { key: 'includeComparison' as const, label: 'Comparativa', desc: 'Entre seleccionados' }
    ];

    function handleModeChange(mode: AnalysisMode) {
        options.analysisMode = mode;
        insightsStore.setAnalysisMode(mode);
        if ((mode === 'individual' || mode === 'comparison') && selectedStudents.length === 0) {
            insightsStore.setActiveView('students');
        }
    }

    function toggleOption(key: keyof ReportOptions) {
        (options as unknown as Record<string, boolean>)[key] = !options[key];
    }

    async function generateReport() {
        isGenerating = true;
        options.studentIds = selectedStudents.map(s => s.id);
        await insightsStore.generateReport(ilid, options);
        isGenerating = false;
    }

    let enabledOptionsCount = $derived(
        analysisOptions.filter(opt => options[opt.key]).length
    );
</script>

<div class="space-y-6">
    <!-- Header -->
    <div>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Configurar Informe</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">Personaliza el analisis segun tus necesidades</p>
    </div>

    <!-- Main Grid: Two columns on large screens -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left Column -->
        <div class="space-y-6">
            <!-- Analysis Mode -->
            <Card class="p-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Modo de Analisis</h3>
                <div class="grid grid-cols-3 gap-3">
                    {#each analysisModes as mode (mode.id)}
                        <button
                            onclick={() => handleModeChange(mode.id)}
                            class="relative p-3 rounded-xl border-2 text-center transition-all duration-200
                                {options.analysisMode === mode.id
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}"
                        >
                            <div class="flex flex-col items-center gap-2">
                                <div class="p-2 rounded-lg {options.analysisMode === mode.id
                                    ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}">
                                    <svelte:component this={mode.icon} size={18} />
                                </div>
                                <span class="text-sm font-medium text-gray-900 dark:text-white">{mode.label}</span>
                            </div>
                            {#if options.analysisMode === mode.id}
                                <div class="absolute top-1 right-1">
                                    <svg class="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                                    </svg>
                                </div>
                            {/if}
                        </button>
                    {/each}
                </div>

                {#if options.analysisMode !== 'cohort'}
                    <div class="mt-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        {#if selectedStudents.length > 0}
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm font-medium text-blue-700 dark:text-blue-300">
                                    {selectedStudents.length} estudiante{selectedStudents.length !== 1 ? 's' : ''}
                                </span>
                                <Button color="light" size="xs" onclick={() => insightsStore.setActiveView('students')}>Modificar</Button>
                            </div>
                            <div class="flex flex-wrap gap-1">
                                {#each selectedStudents.slice(0, 4) as student (student.id)}
                                    <span class="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300">
                                        {student.alias || student.username}
                                    </span>
                                {/each}
                                {#if selectedStudents.length > 4}
                                    <span class="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300">
                                        +{selectedStudents.length - 4}
                                    </span>
                                {/if}
                            </div>
                        {:else}
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-blue-700 dark:text-blue-300">Selecciona estudiantes</span>
                                <Button color="blue" size="xs" onclick={() => insightsStore.setActiveView('students')}>Seleccionar</Button>
                            </div>
                        {/if}
                    </div>
                {/if}
            </Card>

            <!-- Model & Depth Row -->
            <div class="grid grid-cols-2 gap-4">
                <!-- Model Selector -->
                <Card class="p-4">
                    <div class="flex items-center gap-2 mb-3">
                        <Cpu size={16} class="text-gray-500" />
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Modelo</span>
                    </div>
                    <select
                        bind:value={options.model}
                        class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700
                            bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                            focus:ring-2 focus:ring-blue-500"
                    >
                        {#each models as model (model)}
                            <option value={model}>{model}</option>
                        {/each}
                    </select>
                </Card>

                <!-- Depth Selector -->
                <Card class="p-4">
                    <div class="flex items-center gap-2 mb-3">
                        <Sliders size={16} class="text-gray-500" />
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Profundidad</span>
                    </div>
                    <select
                        bind:value={options.analysisDepth}
                        class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700
                            bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                            focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="basic">Basico</option>
                        <option value="standard">Estandar</option>
                        <option value="comprehensive">Completo</option>
                    </select>
                </Card>
            </div>

            <!-- Focus Areas -->
            <Card class="p-4">
                <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Areas de Enfoque</h4>
                <div class="grid grid-cols-3 gap-2">
                    {#each [
                        { id: 'engagement', label: 'Participacion' },
                        { id: 'performance', label: 'Rendimiento' },
                        { id: 'difficulties', label: 'Dificultades' }
                    ] as area (area.id)}
                        <button
                            onclick={() => {
                                const current = options.focusAreas;
                                options.focusAreas = current.includes(area.id)
                                    ? current.filter(a => a !== area.id)
                                    : [...current, area.id];
                            }}
                            class="p-2 rounded-lg border-2 text-center text-sm font-medium transition-all
                                {options.focusAreas.includes(area.id)
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'}"
                        >
                            {area.label}
                        </button>
                    {/each}
                </div>
            </Card>

            <!-- Custom Prompt -->
            <Card class="p-4">
                <div class="flex items-center gap-2 mb-3">
                    <FileText size={16} class="text-gray-500" />
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Prompt Personalizado</span>
                </div>
                <Textarea
                    bind:value={options.customPrompt}
                    placeholder="Instrucciones adicionales..."
                    rows={3}
                    class="text-sm"
                />
            </Card>
        </div>

        <!-- Right Column: Analysis Options -->
        <div class="space-y-6">
            <Card class="p-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Opciones de Analisis</h3>
                <div class="grid grid-cols-2 gap-2">
                    {#each analysisOptions as opt (opt.key)}
                        <button
                            onclick={() => toggleOption(opt.key)}
                            class="flex items-center gap-2 p-2.5 rounded-lg border-2 text-left transition-all duration-150
                                {options[opt.key]
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}"
                        >
                            <div class="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0
                                {options[opt.key]
                                    ? 'border-blue-500 bg-blue-500'
                                    : 'border-gray-300 dark:border-gray-600'}">
                                {#if options[opt.key]}
                                    <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                                    </svg>
                                {/if}
                            </div>
                            <div class="min-w-0">
                                <span class="block text-sm font-medium text-gray-900 dark:text-white truncate">{opt.label}</span>
                                <span class="block text-xs text-gray-500 dark:text-gray-400 truncate">{opt.desc}</span>
                            </div>
                        </button>
                    {/each}
                </div>

                <!-- Include Examples Toggle -->
                <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onclick={() => options.includeExamples = !options.includeExamples}
                        class="w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all
                            {options.includeExamples
                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                : 'border-gray-200 dark:border-gray-700'}"
                    >
                        <div>
                            <span class="block text-sm font-medium text-gray-900 dark:text-white">Incluir ejemplos</span>
                            <span class="block text-xs text-gray-500 dark:text-gray-400">Citas de conversaciones</span>
                        </div>
                        <div class="w-10 h-6 rounded-full transition-colors
                            {options.includeExamples ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}">
                            <div class="w-5 h-5 mt-0.5 rounded-full bg-white shadow transition-transform
                                {options.includeExamples ? 'translate-x-4.5 ml-0.5' : 'translate-x-0.5'}"></div>
                        </div>
                    </button>
                </div>
            </Card>

            <!-- Summary Card -->
            <Card class="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
                <h4 class="font-semibold text-gray-900 dark:text-white mb-3">Resumen</h4>
                <div class="grid grid-cols-2 gap-3 text-sm">
                    <div class="p-2 rounded-lg bg-white/50 dark:bg-gray-800/50">
                        <span class="block text-gray-500 dark:text-gray-400 text-xs">Modo</span>
                        <span class="font-medium text-gray-900 dark:text-white">
                            {analysisModes.find(m => m.id === options.analysisMode)?.label}
                        </span>
                    </div>
                    <div class="p-2 rounded-lg bg-white/50 dark:bg-gray-800/50">
                        <span class="block text-gray-500 dark:text-gray-400 text-xs">Profundidad</span>
                        <span class="font-medium text-gray-900 dark:text-white capitalize">{options.analysisDepth}</span>
                    </div>
                    <div class="p-2 rounded-lg bg-white/50 dark:bg-gray-800/50">
                        <span class="block text-gray-500 dark:text-gray-400 text-xs">Opciones</span>
                        <span class="font-medium text-gray-900 dark:text-white">{enabledOptionsCount} activas</span>
                    </div>
                    {#if options.analysisMode !== 'cohort'}
                        <div class="p-2 rounded-lg bg-white/50 dark:bg-gray-800/50">
                            <span class="block text-gray-500 dark:text-gray-400 text-xs">Estudiantes</span>
                            <span class="font-medium text-gray-900 dark:text-white">{selectedStudents.length}</span>
                        </div>
                    {/if}
                </div>
            </Card>
        </div>
    </div>

    <!-- Generate Button - Full Width -->
    <div class="flex justify-center">
        <Button
            color="blue"
            size="xl"
            onclick={generateReport}
            disabled={isGenerating || (options.analysisMode !== 'cohort' && selectedStudents.length === 0)}
            class="gap-2 px-8"
        >
            {#if isGenerating}
                <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generando...
            {:else}
                <Zap size={20} />
                Generar Informe
            {/if}
        </Button>
    </div>
</div>
