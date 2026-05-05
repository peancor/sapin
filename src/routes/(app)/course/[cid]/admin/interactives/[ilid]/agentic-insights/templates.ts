import type { InsightsAgentRunScope } from '$lib/types/insightsAgent';

export type InsightTemplateId =
	| 'risk_scan'
	| 'cohort_summary'
	| 'student_support'
	| 'friction_points'
	| 'redesign_summary'
	| 'next_edition_adjustments'
	| 'compare_groups';

export type InsightTemplateFamily =
	| 'understand'
	| 'improve'
	| 'compare'
	| 'follow_up';

type TemplateScopeMode = Exclude<InsightsAgentRunScope['mode'], 'sessions'>;
type DatePreset = 'last_14_days' | 'none';

export interface InsightStudentOption {
	id: string;
	username: string;
	email?: string | null;
}

export interface InsightQuickAction {
	id: string;
	title: string;
	description: string;
	buttonLabel: string;
	promptFactory: (context: InsightPromptContext) => string;
}

export interface InsightTemplateDefinition {
	id: InsightTemplateId;
	family: InsightTemplateFamily;
	title: string;
	description: string;
	resultSummary: string;
	estimatedTime: string;
	caution: string;
	defaultObjective: string;
	requiresStudent: boolean;
	supportsDateRange: boolean;
	defaultScope: {
		mode: TemplateScopeMode;
		search: string | null;
		datePreset: DatePreset;
	};
	supportsGroupComparison?: boolean;
	groupSelectionMode?: 'single_vs_rest' | 'two_explicit_groups';
	recommendedTools?: string[];
	emptyStateHint?: string;
	buildRunTitle: (context: InsightPromptContext) => string;
	promptFactory: (context: InsightPromptContext) => string;
	quickActions: InsightQuickAction[];
}

export interface InsightPromptContext {
	activityName: string;
	objective: string;
	scope: InsightsAgentRunScope;
	student: InsightStudentOption | null;
	groupAStudentIds?: string[];
	groupBStudentIds?: string[];
	groupALabel?: string;
	groupBLabel?: string;
}

function describeDateRange(scope: InsightsAgentRunScope): string {
	if (!scope.dateFrom && !scope.dateTo) return 'Sin filtro temporal.';
	if (scope.dateFrom && scope.dateTo) return `Periodo analizado: del ${scope.dateFrom} al ${scope.dateTo}.`;
	if (scope.dateFrom) return `Periodo analizado: desde ${scope.dateFrom}.`;
	return `Periodo analizado: hasta ${scope.dateTo}.`;
}

function describeSearch(scope: InsightsAgentRunScope): string {
	return scope.search ? `Refina la evidencia usando este criterio textual: "${scope.search}".` : '';
}

function objectiveSentence(objective: string): string {
	return objective.trim().length > 0
		? `Objetivo docente: ${objective.trim()}.`
		: 'Objetivo docente: ofrecer una salida clara y accionable para el profesorado.';
}

function studentSentence(student: InsightStudentOption | null): string {
	return student
		? `Estudiante priorizado: ${student.username} (${student.id}).`
		: 'No hay estudiante individual seleccionado.';
}

function comparisonSentence(context: InsightPromptContext): string {
	const groupACount = context.groupAStudentIds?.length ?? 0;
	const groupBCount = context.groupBStudentIds?.length ?? 0;
	if (groupACount === 0) return 'No hay grupo A seleccionado.';

	const labelA = context.groupALabel?.trim() || 'grupo A';
	const labelB = context.groupBLabel?.trim() || (groupBCount > 0 ? 'grupo B' : 'resto de la cohorte');
	return `Compara ${labelA} (${groupACount} estudiantes) con ${labelB}${groupBCount > 0 ? ` (${groupBCount} estudiantes)` : ''}.`;
}

function sharedOutputContract(extraInstruction: string): string {
	return [
		'Responde en espanol claro, sin jerga tecnica innecesaria.',
		'Separa siempre la respuesta en los apartados "Datos observados" e "Interpretacion o recomendacion de la IA".',
		'Cuando propongas acciones, explica prioridades y deja claro que el docente decide.',
		extraInstruction
	]
		.filter(Boolean)
		.join(' ');
}

export const insightTemplates: InsightTemplateDefinition[] = [
	{
		id: 'risk_scan',
		family: 'follow_up',
		title: 'Detectar estudiantes en riesgo',
		description: 'Identifica senales de alerta temprana y prioriza a quien necesita seguimiento.',
		resultSummary: 'Senales de riesgo, prioridades y siguientes acciones.',
		estimatedTime: '3-5 min',
		caution: 'La IA sugiere prioridades; la decision final siempre es docente.',
		defaultObjective: 'Quiero saber que estudiantes necesitan atencion prioritaria esta semana.',
		requiresStudent: false,
		supportsDateRange: true,
		defaultScope: {
			mode: 'cohort',
			search: null,
			datePreset: 'last_14_days'
		},
		recommendedTools: ['forecast_completion_risk', 'summarize_evidence_for_student'],
		emptyStateHint: 'Necesita evidencia reciente para priorizar seguimiento.',
		buildRunTitle: () => 'Deteccion de estudiantes en riesgo',
		promptFactory: ({ activityName, objective, scope }) =>
			[
				`Analiza la actividad "${activityName}" para detectar estudiantes en riesgo academico o de participacion.`,
				objectiveSentence(objective),
				describeDateRange(scope),
				describeSearch(scope),
				'Busca patrones de inactividad, bloqueos recurrentes, baja participacion o dificultades persistentes.',
				sharedOutputContract(
					'Cierra con "Siguientes acciones" y prioriza maximo 5 estudiantes o grupos.'
				)
			]
				.filter(Boolean)
				.join(' '),
		quickActions: [
			{
				id: 'risk_priorities',
				title: 'Priorizar seguimiento',
				description: 'Pide una lista corta de a quien atender primero y por que.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ activityName }) =>
					`Sobre la actividad "${activityName}", dame una priorizacion breve del seguimiento docente. Separa la respuesta en "Datos observados" e "Interpretacion o recomendacion de la IA". Termina con "Siguientes acciones" concretas y prudentes.`
			},
			{
				id: 'risk_support_plan',
				title: 'Preparar plan de apoyo',
				description: 'Convierte los hallazgos en un plan de apoyo docente de una semana.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ activityName }) =>
					`Convierte el analisis actual de "${activityName}" en un plan de apoyo docente para la proxima semana. Usa los apartados "Datos observados" e "Interpretacion o recomendacion de la IA", y termina con un plan de acciones priorizadas.`
			}
		]
	},
	{
		id: 'cohort_summary',
		family: 'understand',
		title: 'Resumen de la actividad',
		description: 'Resume que esta funcionando, donde hay bloqueos y que ajustes conviene hacer.',
		resultSummary: 'Que va bien, bloqueos y ajustes docentes.',
		estimatedTime: '2-4 min',
		caution: 'Conviene contrastar las recomendaciones con el contexto del curso.',
		defaultObjective: 'Necesito una vision general clara para decidir el siguiente ajuste docente.',
		requiresStudent: false,
		supportsDateRange: true,
		defaultScope: {
			mode: 'cohort',
			search: null,
			datePreset: 'none'
		},
		recommendedTools: ['get_learning_progress_timeline', 'get_activity_evidence_overview'],
		emptyStateHint: 'Use esta plantilla cuando quiera una lectura ejecutiva de la actividad.',
		buildRunTitle: () => 'Resumen de la actividad',
		promptFactory: ({ activityName, objective, scope }) =>
			[
				`Resume la actividad "${activityName}" para un docente que necesita una vision ejecutiva clara.`,
				objectiveSentence(objective),
				describeDateRange(scope),
				describeSearch(scope),
				'Destaca que esta funcionando, donde aparecen bloqueos y que ajustes inmediatos pueden mejorar la experiencia.',
				sharedOutputContract(
					'Termina con "Ajustes docentes recomendados" en formato breve y accionable.'
				)
			]
				.filter(Boolean)
				.join(' '),
		quickActions: [
			{
				id: 'summary_next_steps',
				title: 'Siguientes ajustes docentes',
				description: 'Pide una lista concreta de mejoras inmediatas.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ activityName }) =>
					`A partir del analisis de "${activityName}", propon tres ajustes docentes inmediatos. Separa "Datos observados" de "Interpretacion o recomendacion de la IA" y justifica cada ajuste.`
			},
			{
				id: 'summary_family',
				title: 'Resumen para coordinación',
				description: 'Reescribe el hallazgo en un tono breve para compartirlo con el equipo.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ activityName }) =>
					`Reformula el analisis de "${activityName}" como un resumen breve para coordinacion academica. Manten los apartados "Datos observados" e "Interpretacion o recomendacion de la IA".`
			}
		]
	},
	{
		id: 'student_support',
		family: 'follow_up',
		title: 'Preparar apoyo para un estudiante',
		description: 'Sintetiza la evidencia de un estudiante y genera apoyo docente seguro.',
		resultSummary: 'Sintesis de evidencia, plan de apoyo y borradores seguros.',
		estimatedTime: '4-6 min',
		caution: 'Todo sale como borrador revisable; nada se envia automaticamente.',
		defaultObjective: 'Quiero preparar una intervencion cuidadosa y basada en evidencia para este estudiante.',
		requiresStudent: true,
		supportsDateRange: false,
		defaultScope: {
			mode: 'students',
			search: null,
			datePreset: 'none'
		},
		recommendedTools: ['summarize_evidence_for_student', 'draft_outreach_message'],
		emptyStateHint: 'Seleccione un estudiante para activar esta plantilla.',
		buildRunTitle: ({ student }) =>
			student ? `Apoyo para ${student.username}` : 'Preparar apoyo individual',
		promptFactory: ({ activityName, objective, scope, student }) =>
			[
				`Analiza la actividad "${activityName}" para preparar apoyo docente individual.`,
				studentSentence(student),
				objectiveSentence(objective),
				describeSearch(scope),
				'Necesito una sintesis de la evidencia del estudiante, posibles bloqueos, fortalezas y una propuesta de intervencion prudente.',
				sharedOutputContract(
					'Termina con "Plan de apoyo sugerido" y "Borradores seguros". No envies nada.'
				)
			]
				.filter(Boolean)
				.join(' '),
		quickActions: [
			{
				id: 'student_support_plan',
				title: 'Generar plan de apoyo',
				description: 'Prepara una intervencion concreta, gradual y prudente.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ student }) =>
					`Genera un plan de apoyo para ${student?.username ?? 'el estudiante seleccionado'}. Separa "Datos observados" de "Interpretacion o recomendacion de la IA" y termina con pasos concretos para esta semana.`
			},
			{
				id: 'student_support_email',
				title: 'Borrador de email',
				description: 'Redacta un correo de seguimiento revisable y respetuoso.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ student }) =>
					`Prepara un borrador de email para ${student?.username ?? 'el estudiante seleccionado'}. Primero resume "Datos observados" e "Interpretacion o recomendacion de la IA". Luego incluye un apartado "Borrador de email". No envies nada.`
			},
			{
				id: 'student_support_notification',
				title: 'Borrador de notificación',
				description: 'Redacta un mensaje breve para el aula virtual o aviso interno.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ student }) =>
					`Prepara una notificacion breve para ${student?.username ?? 'el estudiante seleccionado'}. Organiza la respuesta con "Datos observados", "Interpretacion o recomendacion de la IA" y "Borrador de notificacion". No envies nada.`
			}
		]
	},
	{
		id: 'friction_points',
		family: 'understand',
		title: 'Detectar puntos de friccion',
		description: 'Detecta donde se atasca el alumnado y que partes de la actividad generan mas dificultad.',
		resultSummary: 'Bloqueos, senales de dificultad y prioridades de revision.',
		estimatedTime: '3-5 min',
		caution: 'Distingue entre friccion observada y la interpretacion pedagogica posterior.',
		defaultObjective: 'Quiero identificar donde aparece mas friccion para decidir que revisar primero.',
		requiresStudent: false,
		supportsDateRange: true,
		defaultScope: {
			mode: 'cohort',
			search: null,
			datePreset: 'last_14_days'
		},
		recommendedTools: ['analyze_activity_difficulty', 'find_stuck_sessions'],
		emptyStateHint: 'Funciona mejor cuando ya hay varias sesiones o intentos registrados.',
		buildRunTitle: () => 'Puntos de friccion de la actividad',
		promptFactory: ({ activityName, objective, scope }) =>
			[
				`Analiza la actividad "${activityName}" para detectar puntos de friccion y senales de atasco.`,
				objectiveSentence(objective),
				describeDateRange(scope),
				describeSearch(scope),
				'Necesito localizar donde el alumnado se bloquea, que sintomas aparecen y que conviene revisar primero.',
				sharedOutputContract(
					'Termina con "Prioridades de revision" y ordena los hallazgos por impacto docente.'
				)
			]
				.filter(Boolean)
				.join(' '),
		quickActions: [
			{
				id: 'friction_priorities',
				title: 'Priorizar fricciones',
				description: 'Resume que puntos conviene revisar primero y por que.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ activityName }) =>
					`Prioriza los principales puntos de friccion detectados en "${activityName}". Separa "Datos observados" de "Interpretacion o recomendacion de la IA" y termina con "Prioridades de revision".`
			},
			{
				id: 'friction_intervention',
				title: 'Proponer intervencion inmediata',
				description: 'Convierte los hallazgos en acciones docentes de corto plazo.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ activityName }) =>
					`A partir de las fricciones detectadas en "${activityName}", propone una intervencion docente inmediata. Usa "Datos observados" e "Interpretacion o recomendacion de la IA" y cierra con acciones concretas para esta semana.`
			}
		]
	},
	{
		id: 'redesign_summary',
		family: 'improve',
		title: 'Resumen para rediseño docente',
		description: 'Convierte la evidencia en una lectura util para redisenar la actividad con criterio.',
		resultSummary: 'Que funciona, que no y que cambios tendrian mas impacto.',
		estimatedTime: '4-6 min',
		caution: 'Usa la evidencia como base, pero las decisiones finales deben considerar contexto y objetivos.',
		defaultObjective: 'Quiero preparar un rediseño informado de la actividad para la siguiente iteracion.',
		requiresStudent: false,
		supportsDateRange: true,
		defaultScope: {
			mode: 'cohort',
			search: null,
			datePreset: 'none'
		},
		recommendedTools: [
			'analyze_activity_difficulty',
			'get_learning_progress_timeline',
			'get_activity_tool_usage_summary'
		],
		emptyStateHint: 'Use esta plantilla cuando quiera transformar el analisis en decisiones de rediseño.',
		buildRunTitle: () => 'Resumen para rediseño docente',
		promptFactory: ({ activityName, objective, scope }) =>
			[
				`Analiza la actividad "${activityName}" para apoyar su rediseño docente.`,
				objectiveSentence(objective),
				describeDateRange(scope),
				describeSearch(scope),
				'Necesito entender que partes estan funcionando, cuales generan problemas y que ajustes estructurales tendrian mayor impacto.',
				sharedOutputContract(
					'Termina con "Cambios de rediseño sugeridos" y justifica cada cambio.'
				)
			]
				.filter(Boolean)
				.join(' '),
		quickActions: [
			{
				id: 'redesign_convert',
				title: 'Convertir en rediseño',
				description: 'Pasa del diagnostico a una propuesta concreta de rediseño.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ activityName }) =>
					`Convierte el analisis de "${activityName}" en una propuesta de rediseño docente. Separa "Datos observados" de "Interpretacion o recomendacion de la IA" y termina con una lista priorizada de cambios.`
			},
			{
				id: 'redesign_coordination',
				title: 'Resumen para coordinacion',
				description: 'Sintetiza hallazgos y cambios para compartirlos con el equipo.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ activityName }) =>
					`Reformula el rediseño sugerido para "${activityName}" como un resumen breve para coordinacion academica. Mantiene "Datos observados" e "Interpretacion o recomendacion de la IA".`
			}
		]
	},
	{
		id: 'next_edition_adjustments',
		family: 'improve',
		title: 'Preparar ajustes para la siguiente edicion',
		description: 'Transforma hallazgos en cambios concretos de consigna, secuencia, apoyo y evaluacion.',
		resultSummary: 'Checklist de cambios y preparacion para la siguiente edicion.',
		estimatedTime: '4-6 min',
		caution: 'Piensa en cambios asumibles; evita propuestas demasiado amplias o abstractas.',
		defaultObjective: 'Quiero salir con ajustes concretos para preparar la siguiente edicion de esta actividad.',
		requiresStudent: false,
		supportsDateRange: true,
		defaultScope: {
			mode: 'cohort',
			search: null,
			datePreset: 'none'
		},
		recommendedTools: ['analyze_activity_difficulty', 'get_activity_tool_usage_summary'],
		emptyStateHint: 'Ideal cuando ya sabe que la actividad se repetira y quiere una lista operativa.',
		buildRunTitle: () => 'Ajustes para la siguiente edicion',
		promptFactory: ({ activityName, objective, scope }) =>
			[
				`Analiza la actividad "${activityName}" para preparar la siguiente edicion.`,
				objectiveSentence(objective),
				describeDateRange(scope),
				describeSearch(scope),
				'Propone cambios concretos en consigna, secuencia, apoyo, evaluacion y uso de herramientas.',
				sharedOutputContract(
					'Termina con "Checklist para la siguiente edicion" en formato operativo.'
				)
			]
				.filter(Boolean)
				.join(' '),
		quickActions: [
			{
				id: 'next_edition_plan',
				title: 'Plan de cambios',
				description: 'Genera una secuencia breve de cambios para la proxima iteracion.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ activityName }) =>
					`Convierte el analisis de "${activityName}" en un plan breve de cambios para la siguiente edicion. Usa "Datos observados", "Interpretacion o recomendacion de la IA" y cierra con una secuencia priorizada.`
			},
			{
				id: 'next_edition_checklist',
				title: 'Checklist de preparacion',
				description: 'Prepara una lista operativa antes de volver a lanzar la actividad.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ activityName }) =>
					`Prepara una checklist de preparacion para la siguiente edicion de "${activityName}". Separa "Datos observados" de "Interpretacion o recomendacion de la IA" y termina con una checklist accionable.`
			}
		]
	},
	{
		id: 'compare_groups',
		family: 'compare',
		title: 'Comparar dos grupos',
		description: 'Contrasta un grupo seleccionado frente al resto de la cohorte para detectar diferencias relevantes.',
		resultSummary: 'Diferencias observadas, interpretacion prudente y acciones docentes derivadas.',
		estimatedTime: '4-6 min',
		caution: 'No conviertas diferencias descriptivas en causalidad sin evidencia adicional.',
		defaultObjective: 'Quiero comparar un grupo concreto frente al resto de la cohorte para orientar decisiones docentes.',
		requiresStudent: false,
		supportsDateRange: true,
		defaultScope: {
			mode: 'cohort',
			search: null,
			datePreset: 'none'
		},
		supportsGroupComparison: true,
		groupSelectionMode: 'single_vs_rest',
		recommendedTools: ['compare_student_groups'],
		emptyStateHint: 'Seleccione al menos un estudiante para el grupo A.',
		buildRunTitle: ({ groupALabel, groupAStudentIds }) =>
			`Comparacion: ${groupALabel?.trim() || `grupo A (${groupAStudentIds?.length ?? 0})`} vs resto`,
		promptFactory: ({ activityName, objective, scope, ...context }) =>
			[
				`Compara grupos dentro de la actividad "${activityName}".`,
				comparisonSentence(context as InsightPromptContext),
				objectiveSentence(objective),
				describeDateRange(scope),
				describeSearch(scope),
				'Necesito diferencias observadas, una interpretacion prudente y acciones docentes derivadas sin sobregeneralizar.',
				sharedOutputContract(
					'Termina con "Diferencias clave" y "Acciones docentes sugeridas".'
				)
			]
				.filter(Boolean)
				.join(' '),
		quickActions: [
			{
				id: 'compare_groups_explain',
				title: 'Explicar diferencias clave',
				description: 'Resume las diferencias mas relevantes de forma util para la docencia.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ groupALabel, groupBLabel }) =>
					`Resume las diferencias clave entre ${groupALabel || 'el grupo seleccionado'} y ${groupBLabel || 'el resto de la cohorte'}. Separa "Datos observados" de "Interpretacion o recomendacion de la IA".`
			},
			{
				id: 'compare_groups_balance',
				title: 'Equilibrar resultados',
				description: 'Propone acciones para reducir brechas o desigualdades observadas.',
				buttonLabel: 'Preparar en el chat',
				promptFactory: ({ groupALabel, groupBLabel }) =>
					`A partir de la comparacion entre ${groupALabel || 'el grupo seleccionado'} y ${groupBLabel || 'el resto de la cohorte'}, sugiere acciones docentes para equilibrar resultados. Usa "Datos observados" e "Interpretacion o recomendacion de la IA".`
			}
		]
	}
];

export function getInsightTemplate(templateId: InsightTemplateId): InsightTemplateDefinition {
	const template = insightTemplates.find((entry) => entry.id === templateId);
	if (!template) {
		throw new Error(`Plantilla desconocida: ${templateId}`);
	}
	return template;
}
