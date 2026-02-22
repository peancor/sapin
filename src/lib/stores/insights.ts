import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import type {
    InsightsState,
    InsightsView,
    AnalysisMode,
    StudentData,
    ConsolidatedMetrics,
    ReportOptions,
    StreamingPhase
} from '$lib/types/insights';

// Fases de streaming
export const STREAMING_PHASES: StreamingPhase[] = [
    { id: 1, name: 'Recopilando datos', icon: '📊', status: 'pending' },
    { id: 2, name: 'Analizando participación', icon: '👥', status: 'pending' },
    { id: 3, name: 'Evaluando rendimiento', icon: '📈', status: 'pending' },
    { id: 4, name: 'Identificando dificultades', icon: '🔍', status: 'pending' },
    { id: 5, name: 'Generando recomendaciones', icon: '💡', status: 'pending' }
];

// Secciones del markdown que corresponden a cada fase
const PHASE_MARKERS = [
    { phase: 1, markers: ['# Informe', '## Resumen', '## Datos'] },
    { phase: 2, markers: ['## Participación', '## Engagement', '## Análisis de Participación'] },
    { phase: 3, markers: ['## Rendimiento', '## Performance', '## Evaluación'] },
    { phase: 4, markers: ['## Dificultades', '## Problemas', '## Áreas de Mejora', '## Conceptos'] },
    { phase: 5, markers: ['## Recomendaciones', '## Conclusiones', '## Plan de Acción'] }
];

// Estado inicial
const initialState: InsightsState = {
    activeView: 'overview',
    analysisMode: 'cohort',
    selectedStudentIds: [],
    students: [],
    consolidatedMetrics: null,
    isGenerating: false,
    streamingContent: '',
    streamingProgress: 0,
    currentPhase: 0,
    report: {
        content: '',
        generatedAt: null,
        chartData: null
    },
    isLoading: false,
    error: null
};

// Clave para localStorage
const STORAGE_KEY_PREFIX = 'insights_store_';

function createInsightsStore() {
    const { subscribe, set, update } = writable<InsightsState>(initialState);

    // Detectar la fase actual basándose en el contenido del streaming
    function detectPhase(content: string): number {
        let detectedPhase = 1;
        for (const { phase, markers } of PHASE_MARKERS) {
            for (const marker of markers) {
                if (content.includes(marker)) {
                    detectedPhase = Math.max(detectedPhase, phase);
                }
            }
        }
        return detectedPhase;
    }

    // Calcular progreso basado en la fase actual
    function calculateProgress(phase: number, contentLength: number): number {
        const baseProgress = ((phase - 1) / STREAMING_PHASES.length) * 100;
        const phaseProgress = Math.min(contentLength / 500, 1) * (100 / STREAMING_PHASES.length);
        return Math.min(baseProgress + phaseProgress, 100);
    }

    return {
        subscribe,

        // Inicializar con datos del servidor
        init: (ilid: string, students: StudentData[], metrics: ConsolidatedMetrics | null) => {
            update(state => {
                // Intentar cargar informe desde localStorage
                const storageKey = `${STORAGE_KEY_PREFIX}${ilid}`;
                let savedReport = { content: '', generatedAt: null, chartData: null };

                if (browser) {
                    try {
                        const stored = localStorage.getItem(storageKey);
                        if (stored) {
                            const parsed = JSON.parse(stored);
                            savedReport = {
                                content: parsed.report || '',
                                generatedAt: parsed.generatedAt || null,
                                chartData: parsed.chartData || null
                            };
                        }
                    } catch (e) {
                        console.error('Error loading stored report:', e);
                    }
                }

                return {
                    ...state,
                    students,
                    consolidatedMetrics: metrics,
                    report: savedReport,
                    activeView: savedReport.content ? 'report' : 'overview',
                    isLoading: false,
                    error: null
                };
            });
        },

        // Cambiar vista activa
        setActiveView: (view: InsightsView) => {
            update(state => ({ ...state, activeView: view }));
        },

        // Cambiar modo de análisis
        setAnalysisMode: (mode: AnalysisMode) => {
            update(state => ({ ...state, analysisMode: mode }));
        },

        // Seleccionar/deseleccionar estudiante
        toggleStudent: (studentId: string) => {
            update(state => {
                const isSelected = state.selectedStudentIds.includes(studentId);
                return {
                    ...state,
                    selectedStudentIds: isSelected
                        ? state.selectedStudentIds.filter(id => id !== studentId)
                        : [...state.selectedStudentIds, studentId]
                };
            });
        },

        // Seleccionar todos los estudiantes
        selectAllStudents: () => {
            update(state => ({
                ...state,
                selectedStudentIds: state.students.map(s => s.id)
            }));
        },

        // Limpiar selección
        clearSelection: () => {
            update(state => ({ ...state, selectedStudentIds: [] }));
        },

        // Seleccionar estudiantes por filtro
        selectByFilter: (filter: 'all' | 'active' | 'at_risk') => {
            update(state => {
                let filtered: string[];
                switch (filter) {
                    case 'active':
                        filtered = state.students
                            .filter(s => s.metrics.completionStatus !== 'not_started')
                            .map(s => s.id);
                        break;
                    case 'at_risk':
                        filtered = state.students
                            .filter(s => s.metrics.riskLevel === 'high' || s.metrics.riskLevel === 'medium')
                            .map(s => s.id);
                        break;
                    default:
                        filtered = state.students.map(s => s.id);
                }
                return { ...state, selectedStudentIds: filtered };
            });
        },

        // Generar informe con streaming
        generateReport: async (ilid: string, options: ReportOptions) => {
            update(state => ({
                ...state,
                isGenerating: true,
                streamingContent: '',
                streamingProgress: 0,
                currentPhase: 1,
                activeView: 'streaming',
                error: null
            }));

            try {
                const currentState = get({ subscribe });
                const requestBody = {
                    ...options,
                    studentIds: options.analysisMode !== 'cohort'
                        ? currentState.selectedStudentIds
                        : undefined
                };

                const response = await fetch(`/api/ai/insights/${ilid}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    throw new Error('Error al generar el informe de insights');
                }

                const reader = response.body?.getReader();
                if (!reader) {
                    throw new Error('Error al leer la respuesta');
                }

                const decoder = new TextDecoder();
                let content = '';
                let done = false;

                while (!done) {
                    const { value, done: doneReading } = await reader.read();
                    done = doneReading;

                    if (value) {
                        const text = decoder.decode(value);
                        content += text;

                        const phase = detectPhase(content);
                        const progress = calculateProgress(phase, content.length);

                        update(state => ({
                            ...state,
                            streamingContent: content,
                            currentPhase: phase,
                            streamingProgress: progress
                        }));
                    }
                }

                // Informe completado
                const generatedAt = new Date().toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const report = {
                    content,
                    generatedAt,
                    chartData: null // Se puede extraer de la respuesta si se genera
                };

                // Guardar en localStorage
                if (browser) {
                    try {
                        localStorage.setItem(`${STORAGE_KEY_PREFIX}${ilid}`, JSON.stringify({
                            report: content,
                            generatedAt,
                            chartData: null,
                            options,
                            timestamp: new Date().toISOString()
                        }));
                    } catch (e) {
                        console.error('Error saving report:', e);
                    }
                }

                update(state => ({
                    ...state,
                    isGenerating: false,
                    streamingProgress: 100,
                    report,
                    activeView: 'report'
                }));

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
                update(state => ({
                    ...state,
                    isGenerating: false,
                    error: errorMessage,
                    activeView: 'generate'
                }));
            }
        },

        // Limpiar caché del informe
        clearCache: (ilid: string) => {
            if (browser) {
                localStorage.removeItem(`${STORAGE_KEY_PREFIX}${ilid}`);
            }
            update(state => ({
                ...state,
                report: { content: '', generatedAt: null, chartData: null },
                streamingContent: '',
                streamingProgress: 0,
                currentPhase: 0,
                activeView: 'generate'
            }));
        },

        // Resetear store
        reset: () => {
            set(initialState);
        },

        // Establecer error
        setError: (error: string | null) => {
            update(state => ({ ...state, error }));
        },

        // Establecer loading
        setLoading: (isLoading: boolean) => {
            update(state => ({ ...state, isLoading }));
        }
    };
}

export const insightsStore = createInsightsStore();

// Stores derivados para acceso fácil
export const activeView = derived(insightsStore, $state => $state.activeView);
export const selectedStudents = derived(insightsStore, $state =>
    $state.students.filter(s => $state.selectedStudentIds.includes(s.id))
);
export const studentsAtRisk = derived(insightsStore, $state =>
    $state.students.filter(s => s.metrics.riskLevel === 'high' || s.metrics.riskLevel === 'medium')
);
export const streamingPhases = derived(insightsStore, $state => {
    return STREAMING_PHASES.map(phase => ({
        ...phase,
        status: phase.id < $state.currentPhase
            ? 'completed' as const
            : phase.id === $state.currentPhase
                ? 'active' as const
                : 'pending' as const
    }));
});
