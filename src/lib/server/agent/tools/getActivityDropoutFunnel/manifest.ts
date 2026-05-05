import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants.ts';
import type { ToolManifest } from '../types.ts';

export const getActivityDropoutFunnelManifest: ToolManifest = {
	name: 'get_activity_dropout_funnel',
	displayName: 'Obtener embudo de abandono',
	description:
		'Descompone la progresion de la cohorte en matriculados, arranque, actividad, finalizacion y abandono.',
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
			transitions: { type: 'array' },
			alerts: { type: 'array' },
			recommendedActions: { type: 'array' },
			limitations: { type: 'array' }
		},
		required: [
			'activityId',
			'activityName',
			'summary',
			'items',
			'transitions',
			'alerts',
			'recommendedActions',
			'limitations'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getActivityDropoutFunnel' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
