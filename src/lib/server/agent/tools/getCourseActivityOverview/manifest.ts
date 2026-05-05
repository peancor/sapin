import { BUILTIN_TOOL_USAGE_DOMAIN_STAFF_AGENT } from '../constants';
import type { ToolManifest } from '../types';

export const getCourseActivityOverviewManifest: ToolManifest = {
	name: 'get_course_activity_overview',
	displayName: 'Obtener resumen de actividades del curso',
	description:
		'Resume el estado de las actividades del curso para responder preguntas cruzadas entre actividades.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			courseId: {
				type: 'string',
				description: 'Identificador del curso. Si se omite, usa el curso del contexto.'
			},
			activityIds: {
				type: 'array',
				description: 'Lista opcional de actividades concretas a resumir.',
				items: { type: 'string' }
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			totalActivities: { type: 'integer' },
			activities: { type: 'array' },
			aggregate: { type: 'object' }
		},
		required: ['totalActivities', 'activities', 'aggregate']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getCourseActivityOverview' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_STAFF_AGENT
};
