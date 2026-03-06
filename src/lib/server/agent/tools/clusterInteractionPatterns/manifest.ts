import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const clusterInteractionPatternsManifest: ToolManifest = {
	name: 'cluster_interaction_patterns',
	displayName: 'Agrupar patrones de interaccion',
	description:
		'Agrupa estudiantes por patrones de uso e interaccion dentro de la actividad.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string', description: 'Actividad a analizar.' },
			studentIds: {
				type: 'array',
				description: 'Lista opcional de estudiantes concretos.',
				items: { type: 'string' }
			},
			includeMembers: {
				type: 'boolean',
				description: 'Si es true, incluye el detalle de miembros por grupo.'
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			totalStudents: { type: 'integer' },
			clusters: { type: 'array' }
		},
		required: ['activityId', 'activityName', 'totalStudents', 'clusters']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'clusterInteractionPatterns' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
