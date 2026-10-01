import { BUILTIN_TOOL_USAGE_DOMAIN_STAFF_AGENT } from '../constants.ts';
import type { ToolManifest } from '../types.ts';

export const getCourseSequenceBottlenecksManifest: ToolManifest = {
	name: 'get_course_sequence_bottlenecks',
	displayName: 'Obtener cuellos de botella de secuencia',
	description:
		'Localiza las actividades del curso donde la secuencia pierde mas participacion o finalizacion.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			courseId: {
				type: 'string',
				description: 'Identificador del curso. Si se omite, usa el curso del contexto.'
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			courseId: { type: 'string' },
			summary: { type: 'object' },
			items: { type: 'array' },
			alerts: { type: 'array' },
			recommendedActions: { type: 'array' },
			limitations: { type: 'array' }
		},
		required: ['courseId', 'summary', 'items', 'alerts', 'recommendedActions', 'limitations']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getCourseSequenceBottlenecks' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_STAFF_AGENT
};
