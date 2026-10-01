import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const draftRemediationPlanManifest: ToolManifest = {
	name: 'draft_remediation_plan',
	displayName: 'Preparar plan de refuerzo',
	description:
		'Genera un plan de refuerzo accionable para un estudiante a partir de su evidencia en la actividad.',
	category: 'evaluation',
	parametersSchema: {
		type: 'object',
		properties: {
			activityId: {
				type: 'string',
				description: 'Identificador de la actividad. Si se omite, usa la actividad del contexto.'
			},
			studentId: {
				type: 'string',
				description: 'Identificador del estudiante a analizar.'
			},
			dateFrom: { type: 'string', description: 'Fecha inicial ISO opcional.' },
			dateTo: { type: 'string', description: 'Fecha final ISO opcional.' },
			search: { type: 'string', description: 'Texto opcional para filtrar transcripts.' },
			maxActions: { type: 'integer', description: 'Numero maximo de acciones sugeridas.' }
		},
		required: ['studentId']
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			student: { type: 'object' },
			riskLevel: { type: 'string' },
			targetOutcomes: { type: 'array' },
			evidenceSignals: { type: 'array' },
			suggestedFocusTerms: { type: 'array' },
			studentActions: { type: 'array' },
			teacherActions: { type: 'array' },
			successCriteria: { type: 'array' }
		},
		required: [
			'activityId',
			'activityName',
			'student',
			'riskLevel',
			'targetOutcomes',
			'evidenceSignals',
			'suggestedFocusTerms',
			'studentActions',
			'teacherActions',
			'successCriteria'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'draftRemediationPlan' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
