import { BUILTIN_TOOL_USAGE_DOMAIN_STAFF_AGENT } from '../constants.ts';
import type { ToolManifest } from '../types.ts';

export const getTeacherInterventionQueueManifest: ToolManifest = {
	name: 'get_teacher_intervention_queue',
	displayName: 'Obtener cola de intervencion docente',
	description:
		'Prioriza estudiantes o casos que merecen una intervencion docente mas inmediata.',
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
			maxResults: {
				type: 'integer',
				description: 'Numero maximo de casos a devolver.',
				minimum: 1,
				maximum: 50
			},
			minPriority: {
				type: 'string',
				enum: ['low', 'medium', 'high'],
				description: 'Filtra el minimo nivel de prioridad a incluir.'
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
	executorConfig: { handler: 'getTeacherInterventionQueue' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_STAFF_AGENT
};
