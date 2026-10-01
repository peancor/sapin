import { BUILTIN_TOOL_USAGE_DOMAIN_STAFF_AGENT } from '../constants.ts';
import type { ToolManifest } from '../types.ts';

export const recommendGroupInterventionsManifest: ToolManifest = {
	name: 'recommend_group_interventions',
	displayName: 'Recomendar intervenciones grupales',
	description:
		'Propone agrupaciones operativas de alumnado para activacion, desbloqueo, profundizacion o apoyo entre iguales.',
	category: 'evaluation',
	parametersSchema: {
		type: 'object',
		properties: {
			courseId: {
				type: 'string',
				description: 'Identificador del curso. Si se omite, usa el curso del contexto.'
			},
			activityId: {
				type: 'string',
				description: 'Identificador de la actividad. Si se omite, usa la actividad del contexto.'
			},
			studentIds: {
				type: 'array',
				items: { type: 'string' },
				description: 'Lista opcional de estudiantes concretos.'
			},
			maxGroups: {
				type: 'integer',
				description: 'Numero maximo de grupos a devolver.',
				minimum: 1,
				maximum: 6
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			summary: { type: 'object' },
			items: { type: 'array' },
			alerts: { type: 'array' },
			recommendedActions: { type: 'array' },
			limitations: { type: 'array' }
		},
		required: ['summary', 'items', 'alerts', 'recommendedActions', 'limitations']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'recommendGroupInterventions' },
	requiresConfirmation: false,
	riskLevel: 'medium',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_STAFF_AGENT
};
