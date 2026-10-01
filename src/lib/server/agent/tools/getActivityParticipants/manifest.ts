import { BUILTIN_TOOL_USAGE_DOMAIN_STAFF_AGENT } from '../constants';
import type { ToolManifest } from '../types';

export const getActivityParticipantsManifest: ToolManifest = {
	name: 'get_activity_participants',
	displayName: 'Obtener participantes de actividad',
	description:
		'Devuelve participantes, no participantes y metricas de interaccion para una actividad concreta.',
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
				description: 'Lista opcional de estudiantes concretos a incluir.',
				items: { type: 'string' }
			},
			dateFrom: {
				type: 'string',
				description: 'Fecha inicial ISO para filtrar evidencia.'
			},
			dateTo: {
				type: 'string',
				description: 'Fecha final ISO para filtrar evidencia.'
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			participantsCount: { type: 'integer' },
			nonParticipantsCount: { type: 'integer' },
			participationRate: { type: 'integer' },
			participants: { type: 'array' },
			nonParticipants: { type: 'array' }
		},
		required: [
			'participantsCount',
			'nonParticipantsCount',
			'participationRate',
			'participants',
			'nonParticipants'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getActivityParticipants' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_STAFF_AGENT
};
