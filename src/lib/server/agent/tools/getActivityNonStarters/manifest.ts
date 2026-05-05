import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants.ts';
import type { ToolManifest } from '../types.ts';

export const getActivityNonStartersManifest: ToolManifest = {
	name: 'get_activity_non_starters',
	displayName: 'Obtener alumnado que no arranca',
	description:
		'Lista estudiantes matriculados que aun no muestran evidencia real de arranque en una actividad.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			activityId: {
				type: 'string',
				description: 'Identificador de la actividad. Si se omite, usa la actividad del contexto.'
			},
			studentIds: {
				type: 'array',
				items: { type: 'string' },
				description: 'Lista opcional de estudiantes concretos a incluir.'
			},
			daysSincePublished: {
				type: 'integer',
				description: 'Umbral opcional de dias desde publicacion para elevar la prioridad.',
				minimum: 0
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			summary: { type: 'object' },
			items: { type: 'array' },
			alerts: { type: 'array' },
			recommendedActions: { type: 'array' },
			limitations: { type: 'array' }
		},
		required: ['activityId', 'activityName', 'summary', 'items', 'alerts', 'recommendedActions', 'limitations']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getActivityNonStarters' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
