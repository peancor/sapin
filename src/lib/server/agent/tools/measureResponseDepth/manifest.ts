import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants.ts';
import type { ToolManifest } from '../types.ts';

export const measureResponseDepthManifest: ToolManifest = {
	name: 'measure_response_depth',
	displayName: 'Medir profundidad de respuesta',
	description:
		'Estima la elaboracion, justificacion, ejemplos y autocorreccion presentes en las respuestas del alumnado.',
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
			includeEvidenceExcerpts: {
				type: 'boolean',
				description: 'Si es true, incluye extractos breves representativos.'
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
	executorConfig: { handler: 'measureResponseDepth' },
	requiresConfirmation: false,
	riskLevel: 'medium',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
