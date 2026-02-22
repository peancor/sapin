import type { ProcessedChatData, ReportOptions } from "$lib/types/insights";

export class InsightsUtils {
    // Función para generar un prompt para el análisis de chats
    public static generateChatAnalysisPrompt(
        activityContext: {
            name: string;
            description: string | null;
            systemPrompt: string | null;
            llmRole: string | null;
            llmInstructions: string | null;
            llmContext: string | null;
        },
        chats: ProcessedChatData[],
        options: ReportOptions
    ) {
        const promptDepth = {
            basic: 'Proporciona un análisis básico y conciso',
            standard: 'Proporciona un análisis de nivel intermedio con algunos detalles',
            comprehensive: 'Proporciona un análisis exhaustivo y detallado con insights profundos'
        };

        // Determinar el modo de analisis
        const analysisMode = options.analysisMode || 'cohort';
        const studentCount = new Set(chats.map((c) => c.studentId)).size;
        const studentNames = [...new Set(chats.map((c) => c.studentUsername))];

        let analysisModeText = '';
        if (analysisMode === 'cohort') {
            analysisModeText = 'Analisis de cohorte completa: evalua el grupo en su conjunto, identificando patrones generales y tendencias.';
        } else if (analysisMode === 'individual') {
            analysisModeText = `Analisis individual: proporciona evaluaciones detalladas para cada uno de los ${studentCount} estudiantes seleccionados (${studentNames.slice(0, 5).join(', ')}${studentNames.length > 5 ? '...' : ''}).`;
        } else if (analysisMode === 'comparison') {
            analysisModeText = `Analisis comparativo: compara el rendimiento entre los ${studentCount} estudiantes seleccionados, identificando fortalezas y debilidades relativas.`;
        }

        let prompt = `# Solicitud de Analisis de Actividad de Chat para Educadores

## Contexto de la Actividad
- Nombre: ${activityContext.name}
- Descripcion: ${activityContext.description || 'No disponible'}
- Prompt del Sistema: ${activityContext.systemPrompt || 'No disponible'}
- Rol LLM: ${activityContext.llmRole || 'No disponible'}
- Instrucciones LLM: ${activityContext.llmInstructions || 'No disponible'}

## Datos Generales
- Total de Estudiantes: ${studentCount}
- Total de Conversaciones: ${chats.length}
- Total de Mensajes: ${chats.reduce((sum, chat) => sum + chat.messages.length, 0)}

## Modo de Analisis
${analysisModeText}

## Solicitud de Analisis
${promptDepth[options.analysisDepth]} de las conversaciones de los estudiantes en esta actividad de chat educativa.

Areas de enfoque especificas:`;

        if (options.focusAreas.includes('engagement')) {
            prompt += `
- **Participación y Engagement**: 
  - Patrones de participación entre los estudiantes
  - Identificación de estudiantes más activos y menos activos
  - Nivel de participación general en la actividad
  - Duración y profundidad de las conversaciones`;
        }

        if (options.focusAreas.includes('performance')) {
            prompt += `
- **Rendimiento y Comprensión**:
  - Evidencia de comprensión de los conceptos principales
  - Calidad de las respuestas y razonamientos de los estudiantes
  - Identificación de estudiantes que destacan en su rendimiento
  - Progreso observable a lo largo de la conversación`;
        }

        if (options.focusAreas.includes('difficulties')) {
            prompt += `
- **Dificultades y Áreas de Mejora**:
  - Conceptos o temas donde los estudiantes mostraron más dificultades
  - Patrones comunes de confusión o malentendidos
  - Estudiantes que podrían necesitar apoyo adicional
  - Recomendaciones para mejorar la enseñanza en áreas problemáticas`;
        }

        // Nueva opción: Detección de uso de herramientas de IA
        if (options.detectAIUsage) {
            prompt += `
- **Detección de Uso de IA**:
  - Identificar estudiantes que posiblemente han utilizado ChatGPT u otras herramientas de IA para generar sus respuestas
  - Analizar patrones lingüísticos, estructura, coherencia y características típicas de texto generado por IA
  - Proporcionar ejemplos específicos donde se sospeche uso de herramientas de IA
  - Explicar los indicadores que sugieren uso de IA (repetición de patrones, estilo demasiado formal, conocimiento inusualmente amplio, etc.)
  - Ofrecer recomendaciones sobre cómo abordar estas situaciones`;
        }

        // Análisis de progresión temporal
        if (options.temporalAnalysis) {
            prompt += `
- **Análisis de Progresión Temporal**:
  - Evolución del rendimiento de los estudiantes a lo largo del tiempo
  - Identificación de momentos clave de mejora o estancamiento
  - Patrones temporales en la participación y la calidad de las respuestas
  - Recomendaciones para intervenciones oportunas`;
        }

        // Análisis de sentimiento
        if (options.sentimentAnalysis) {
            prompt += `
- **Análisis de Sentimiento**:
  - Detección del tono emocional en las respuestas de los estudiantes
  - Identificación de frustración, confusión, entusiasmo o confianza
  - Correlación entre sentimiento y rendimiento
  - Sugerencias para mejorar el clima emocional del aprendizaje`;
        }

        // Detección de plagio
        if (options.plagiarismDetection) {
            prompt += `
- **Detección de Similitudes entre Estudiantes**:
  - Identificación de respuestas similares o idénticas entre diferentes estudiantes
  - Análisis de patrones de posible colaboración o copia
  - Ejemplos específicos de respuestas con alto grado de similitud
  - Recomendaciones para abordar estas situaciones`;
        }

        // Mapeo de habilidades
        if (options.skillsMapping) {
            prompt += `
- **Mapeo de Habilidades**:
  - Identificación de las habilidades específicas demostradas por cada estudiante
  - Análisis de áreas dominadas vs. áreas que requieren refuerzo
  - Visualización conceptual de fortalezas y debilidades
  - Sugerencias para desarrollar habilidades específicas`;
        }

        // Conceptos erróneos
        if (options.conceptMisconceptions) {
            prompt += `
- **Análisis de Conceptos Erróneos**:
  - Identificación detallada de malentendidos conceptuales comunes
  - Clasificación de errores por categorías y frecuencia
  - Sugerencia de recursos adicionales para abordar estos conceptos
  - Estrategias para corregir conceptos erróneos específicos`;
        }

        // Análisis de terminología
        if (options.terminologyAnalysis) {
            prompt += `
- **Análisis de Terminología**:
  - Evaluación del uso correcto/incorrecto de terminología técnica
  - Identificación de términos problemáticos o mal comprendidos
  - Recomendaciones para mejorar la precisión terminológica
  - Ejemplos de uso correcto e incorrecto de términos clave`;
        }

        // Niveles de competencia
        if (options.competencyLevels) {
            prompt += `
- **Agrupación por Niveles de Competencia**:
  - Segmentación automática de estudiantes en niveles (inicial, intermedio, avanzado)
  - Características específicas de cada grupo
  - Análisis de necesidades específicas por nivel
  - Estrategias diferenciadas para cada nivel de competencia`;
        }

        // Recomendaciones para profesores
        if (options.teacherRecommendations) {
            prompt += `
- **Recomendaciones Pedagógicas Personalizadas**:
  - Sugerencias específicas de intervenciones pedagógicas basadas en los patrones detectados
  - Recursos y actividades complementarias recomendadas
  - Estrategias para adaptar la enseñanza según los resultados
  - Plan de acción concreto para mejorar los resultados`;
        }

        // Análisis de tiempo de respuesta
        if (options.responseTimeAnalysis) {
            prompt += `
- **Estadísticas de Tiempo de Respuesta**:
  - Análisis del tiempo que tardan los estudiantes en responder
  - Identificación de preguntas que requieren más tiempo de reflexión
  - Correlación entre tiempo de respuesta y calidad/precisión
  - Recomendaciones para optimizar los tiempos de interacción`;
        }

        // Comparación con cohortes (si está disponible)
        if (options.cohortComparison) {
            prompt += `
- **Comparativa con Cohortes Anteriores**:
  - Análisis comparativo con resultados de grupos anteriores (si hay datos disponibles)
  - Identificación de diferencias en rendimiento y participación
  - Evolución de tendencias a lo largo del tiempo
  - Recomendaciones basadas en la comparación histórica`;
        }

        // Alertas tempranas
        if (options.includeEarlyWarning) {
            prompt += `
- **Alertas Tempranas y Estudiantes en Riesgo**:
  - Identificacion de estudiantes que muestran senales de riesgo
  - Factores de riesgo especificos para cada estudiante (inactividad, baja participacion, etc.)
  - Nivel de urgencia (alto, medio, bajo) para cada caso
  - Recomendaciones de accion inmediata (contactar por email, programar tutoria, etc.)`;
        }

        // Comparativa entre estudiantes seleccionados
        if (options.includeComparison && analysisMode === 'comparison') {
            prompt += `
- **Comparativa Detallada entre Estudiantes**:
  - Tabla comparativa de metricas clave entre los estudiantes seleccionados
  - Identificacion de fortalezas relativas de cada estudiante
  - Areas donde cada estudiante podria mejorar
  - Sugerencias de agrupacion para trabajo colaborativo`;
        }

        if (options.customPrompt) {
            prompt += `
- **Analisis Personalizado**:
  ${options.customPrompt}`;
        }

        prompt += `

## Formato del Informe
- Utiliza formato con encabezados, listas y énfasis para facilitar la lectura
- Estructura el informe de manera lógica con secciones claras
- Incluye tablas de resumen cuando sea apropiado para presentar datos`;

        if (options.includeExamples) {
            prompt += `
- Incluye ejemplos específicos de conversaciones que ilustren puntos importantes (usando bloques de código para citas)`;
        }

        prompt += `
- Concluye con recomendaciones accionables para el educador

## Datos de Conversaciones de Estudiantes
${JSON.stringify(chats, null, 2)}`;

        return prompt;
    }
}

export const starwarsCharacters: string[] = [
    "Luke Skywalker",
    "Han Solo",
    "Leia Organa",
    "Darth Vader",
    "Obi-Wan Kenobi",
    "Yoda",
    "Chewbacca",
    "C-3PO",
    "R2-D2",
    "Jabba the Hutt",
    "Boba Fett",
    "Emperor Palpatine",
    "Padmé Amidala",
    "Anakin Skywalker",
    "Mace Windu",
    "Jango Fett",
    "Count Dooku",
    "General Grievous",
    "Ahsoka Tano",
    "Cin Drallig",
    "Cara Dune",
    "Rio Durant",
    "Tala Durith",
    "Morgan Elsbeth",
    "Embo",
    "Galen Erso",
    "Jyn Erso",
    "Haja Estree",
    "Cornelius Evazan",
    "Valin Hess",
    "Amilyn Holdo",
    "Ri-Lee Howell",
    "Cere Junda",
    "Cal Kestis",
    "Agen Kolar",
    "Plo Koon",
    "Antoc Merrick",
    "Crix Madine",
    "Baze Malbus",
    "Taron Malicos",
    "Dexter Jettster",
    "Tiaan Jerjerrod",
    "CT-5597 'Jesse'",
    "Caleb Dume / Kanan Jarrus",
    "Mas Amedda",
    "Almec",
    "Stass Allie",
    "Bode Akuna",
    "Gial Ackbar",
    "Cassian Andor",
    "Maarva Andor",
    "Val Beckett",
    "Tobias Beckett",
    "Migs Mayfeld",
    "Moff Gideon",
    "Jannah",
    "Naomi Ackie",
    "Armitage Hux",
    "Kylo Ren",
    "Rey",
    "Finn",
    "Poe Dameron",
    "Supreme Leader Snoke",
    "General Leia Organa",
    "Admiral Ackbar",
    "Mon Mothma",
    "Bail Organa",
    "Breznican",
    "K-2SO",
    "Chirrut Îmwe",
    "Director Krennic",
    "Saw Gerrera",
    "Bodhi Rook",
    "Cassian Andor",
    "Jyn Erso",
    "Galen Erso",
    "Mon Mothma",
    "Bail Organa",
    "Lando Calrissian",
    "Nien Nunb",
    "Wedge Antilles",
    "Admiral Piett",
    "Grand Moff Tarkin",
    "Zuckuss",
    "Bossk",
    "IG-88",
    "Darth Maul",
    "Qui-Gon Jinn",
    "Jar Jar Binks",
    "Shmi Skywalker",
    "Cliegg Lars",
    "Beru Lars",
    "Owen Lars",
    "Biggs Darklighter",
    "Watto",
    "Sebulba",
    "Captain Rex",
    "Asajj Ventress",
    "Cad Bane",
    "Kit Fisto",
    "Shaak Ti",
    "Ki-Adi-Mundi",
    "Plo Koon",
    "Yoda",
    "Mace Windu",
    "Obi-Wan Kenobi",
    "Anakin Skywalker",
    "Count Dooku",
    "General Grievous",
    "Jango Fett",
    "Boba Fett",
    "Bossk",
    "IG-88",
    "Dengar",
    "Zam Wesell",
    "Jabba the Hutt",
    "Bib Fortuna",
    "Salacious Crumb",
    "Greedo",
    "Wuher",
    "Ponda Baba",
    "Dr. Cornelius Evazan",
    "Jan Dodonna",
    "Carlist Rieekan",
    "General Rieekan",
    "Admiral Ozzel",
    "Admiral Piett",
    "General Veers",
    "Lando Calrissian",
    "Nien Nunb",
    "Wedge Antilles",
    "Mon Mothma",
    "Gial Ackbar",
    "General Jan Dodonna",
    "General Rieekan",
    "Admiral Ackbar",
];
