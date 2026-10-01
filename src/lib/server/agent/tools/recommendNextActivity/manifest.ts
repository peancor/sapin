import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const recommendNextActivityManifest: ToolManifest = {
	name: 'recommend_next_activity',
	displayName: 'Recomendar siguiente actividad',
	description:
		'Sugiere la siguiente actividad de la secuencia del curso para un estudiante concreto.',
	category: 'knowledge',
	parametersSchema: {
		type: 'object',
		properties: {
			activityId: {
				type: 'string',
				description: 'Actividad de referencia. Si se omite, usa la actividad del contexto.'
			},
			studentId: {
				type: 'string',
				description: 'Identificador del estudiante a analizar.'
			},
			preferPublishedOnly: {
				type: 'boolean',
				description: 'Si es true, prioriza solo actividades publicadas o cerradas.'
			}
		},
		required: ['studentId']
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			student: { type: 'object' },
			recommendationType: { type: 'string' },
			reason: { type: 'string' },
			recommendedActivity: { type: 'object' },
			alternativeActivities: { type: 'array' }
		},
		required: [
			'activityId',
			'student',
			'recommendationType',
			'reason',
			'alternativeActivities'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'recommendNextActivity' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
