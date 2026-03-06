import type { InsightsAgentRunScope } from '$lib/types/insightsAgent';

export type InsightTemplateId = 'risk_scan' | 'cohort_summary' | 'student_support';

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
	buildRunTitle: (context: InsightPromptContext) => string;
	promptFactory: (context: InsightPromptContext) => string;
	quickActions: InsightQuickAction[];
}

export interface InsightPromptContext {
	activityName: string;
	objective: string;
	scope: InsightsAgentRunScope;
	student: InsightStudentOption | null;
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
	}
];

export function getInsightTemplate(templateId: InsightTemplateId): InsightTemplateDefinition {
	const template = insightTemplates.find((entry) => entry.id === templateId);
	if (!template) {
		throw new Error(`Plantilla desconocida: ${templateId}`);
	}
	return template;
}
