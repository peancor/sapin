import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const getLearningProgressTimelineManifest: ToolManifest = {
	name: 'get_learning_progress_timeline',
	displayName: 'Obtener timeline de progreso',
	description:
		'Devuelve la evolucion temporal del progreso, sesiones y uso de la actividad por estudiante o cohorte.',
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
			chatIds: {
				type: 'array',
				description: 'Lista opcional de sesiones concretas a incluir.',
				items: { type: 'string' }
			},
			dateFrom: { type: 'string', description: 'Fecha inicial ISO opcional.' },
			dateTo: { type: 'string', description: 'Fecha final ISO opcional.' },
			search: { type: 'string', description: 'Texto opcional para filtrar transcripts.' },
			bucket: {
				type: 'string',
				enum: ['day', 'week'],
				description: 'Granularidad temporal del timeline.'
			},
			limit: { type: 'integer', description: 'Numero maximo de puntos temporales.' },
			includeStudentDetails: {
				type: 'boolean',
				description: 'Si es true, incluye detalle por estudiante.'
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			bucket: { type: 'string' },
			totalStudents: { type: 'integer' },
			statuses: { type: 'object' },
			points: { type: 'array' },
			students: { type: 'array' }
		},
		required: ['activityId', 'activityName', 'bucket', 'totalStudents', 'statuses', 'points']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getLearningProgressTimeline' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
