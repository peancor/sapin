import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants.ts';
import type { ToolManifest } from '../types.ts';

export const detectActivityMisconceptionsManifest: ToolManifest = {
	name: 'detect_activity_misconceptions',
	displayName: 'Detectar misconceptions de actividad',
	description:
		'Agrupa patrones recurrentes de confusion conceptual o duda persistente en los transcriptos.',
	category: 'evaluation',
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
				description: 'Lista opcional de estudiantes concretos.'
			},
			dateFrom: { type: 'string', description: 'Fecha inicial ISO opcional.' },
			dateTo: { type: 'string', description: 'Fecha final ISO opcional.' },
			maxClusters: {
				type: 'integer',
				description: 'Numero maximo de clusters a devolver.',
				minimum: 1,
				maximum: 12
			},
			includeEvidenceExcerpts: {
				type: 'boolean',
				description: 'Si es true, incluye extractos de evidencia.'
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
	executorConfig: { handler: 'detectActivityMisconceptions' },
	requiresConfirmation: false,
	riskLevel: 'medium',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
