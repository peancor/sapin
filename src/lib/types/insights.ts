import type { LearningEvidenceInputMetrics } from './learningEvidence';

// Definir interfaz para las estadísticas de chat
export interface ChatSummaryStats {
    totalChats: number;
    totalMessages: number;
    averageMessagesPerChat: number;
    uniqueStudentCount: number;
}

// Modo de análisis
export type AnalysisMode = 'cohort' | 'individual' | 'comparison';

// Estado de completitud del estudiante
export type CompletionStatus = 'not_started' | 'in_progress' | 'completed';

// Nivel de riesgo
export type RiskLevel = 'low' | 'medium' | 'high';

// Métricas de estudiante individual
export interface StudentMetrics {
    totalMessages: number;
    completionStatus: CompletionStatus;
    lastActivityAt: string | null;
    riskLevel: RiskLevel;
    engagementScore?: number;
    avgMessageLength?: number;
    responseCount?: number;
}

// Datos de estudiante para selector
export interface StudentData {
    id: string;
    username: string;
    email: string;
    alias?: string;
    metrics: StudentMetrics;
}

// Factor de riesgo individual
export interface RiskFactor {
    type: 'no_activity' | 'low_engagement' | 'incomplete' | 'short_messages' | 'late_start';
    description: string;
    severity: RiskLevel;
}

// Estudiante en riesgo con detalles
export interface StudentAtRisk {
    student: StudentData;
    riskFactors: RiskFactor[];
    recommendedActions: string[];
}

// Métricas de engagement
export interface EngagementMetrics {
    overallScore: number;
    participationRate: number;
    averageSessionDuration: number;
    messageFrequency: number;
    activeStudentsCount: number;
    inactiveStudentsCount: number;
}

// Métricas de rendimiento
export interface PerformanceMetrics {
    averageCompletionRate: number;
    averageMessageQuality: number;
    topPerformers: string[];
    strugglingStudents: string[];
}

// Métricas consolidadas para overview
export interface ConsolidatedMetrics {
    engagement: EngagementMetrics;
    performance: PerformanceMetrics;
    earlyWarning: {
        studentsAtRisk: StudentAtRisk[];
        totalAtRisk: number;
        riskDistribution: {
            high: number;
            medium: number;
            low: number;
        };
    };
    participation: {
        completed: number;
        inProgress: number;
        notStarted: number;
    };
}

// Vistas disponibles en insights
export type InsightsView = 'overview' | 'students' | 'generate' | 'streaming' | 'report' | 'alerts';

// Fase de streaming
export interface StreamingPhase {
    id: number;
    name: string;
    icon: string;
    status: 'pending' | 'active' | 'completed';
}

// Estado del store de insights
export interface InsightsState {
    activeView: InsightsView;
    analysisMode: AnalysisMode;
    selectedStudentIds: string[];
    students: StudentData[];
    consolidatedMetrics: ConsolidatedMetrics | null;
    isGenerating: boolean;
    streamingContent: string;
    streamingProgress: number;
    currentPhase: number;
    report: {
        content: string;
        generatedAt: string | null;
        chartData: Record<string, unknown> | null;
    };
    isLoading: boolean;
    error: string | null;
}

// Datos de gráfico de engagement temporal
export interface EngagementChartData {
    dates: string[];
    engagement: number[];
    messages: number[];
}

// Datos de radar de rendimiento
export interface PerformanceRadarData {
    categories: string[];
    values: number[];
    maxValue: number;
}

// Datos de donut de participación
export interface ParticipationDonutData {
    completed: number;
    inProgress: number;
    notStarted: number;
}

// Opciones para la generación de informes
export interface ReportOptions {
    analysisDepth: 'basic' | 'standard' | 'comprehensive';
    focusAreas: string[];
    includeExamples: boolean;
    model: string;
    customPrompt: string;
    // Opciones de análisis avanzado
    detectAIUsage: boolean;               // Detectar uso de herramientas como ChatGPT
    temporalAnalysis: boolean;            // Análisis de progresión temporal
    sentimentAnalysis: boolean;           // Análisis de sentimiento en respuestas
    plagiarismDetection: boolean;         // Detección de similitudes entre respuestas
    skillsMapping: boolean;               // Mapeo de habilidades demostradas
    conceptMisconceptions: boolean;       // Análisis de conceptos erróneos
    terminologyAnalysis: boolean;         // Uso de terminología específica
    competencyLevels: boolean;            // Agrupación por niveles de competencia
    teacherRecommendations: boolean;      // Recomendaciones personalizadas para profesores
    responseTimeAnalysis: boolean;        // Estadísticas de tiempo de respuesta
    cohortComparison?: boolean;           // Comparativa con cohortes anteriores (opcional)
    // Nuevas opciones para análisis dual
    analysisMode: AnalysisMode;           // Modo de análisis: cohort, individual, comparison
    studentIds?: string[];                // IDs de estudiantes seleccionados para análisis individual
    includeComparison: boolean;           // Incluir comparativa entre estudiantes seleccionados
    generateCharts: boolean;              // Generar datos para gráficos interactivos
    includeEarlyWarning: boolean;         // Incluir análisis de alertas tempranas
}

// Estructura para los datos de chat procesados para el análisis
export interface ProcessedChatData {
    studentUsername: string;
    studentId: string;
    createdAt: string;
    messages: {
        type: string;
        content: string;
        createdAt: string;
        inputMetrics?: LearningEvidenceInputMetrics;
    }[];
}

// Contexto de la actividad para el análisis
export interface ActivityContext {
    name: string;
    description: string | null;
    systemPrompt: string | null;
    llmRole: string | null;
    llmInstructions: string | null;
    llmContext: string | null;
}
