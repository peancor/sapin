import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
} from '../constants';
import type { ToolManifest } from '../types';

export const getStudentProgressManifest: ToolManifest = {
	name: 'get_student_progress',
	displayName: 'Consultar progreso del estudiante',
	description:
		'Obtiene el progreso actual del estudiante en las actividades del curso. Útil para personalizar el nivel de dificultad o identificar áreas de mejora.',
	category: 'data',
	parametersSchema: {
		type: 'object',
		properties: {
			includeDetails: {
				type: 'boolean',
				description: 'Si incluir detalle de cada actividad',
				default: false
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			completedActivities: { type: 'integer' },
			totalActivities: { type: 'integer' },
			completionRate: { type: 'number' },
			activities: { type: 'array' }
		},
		required: ['completedActivities', 'totalActivities', 'completionRate', 'activities']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'getStudentProgress' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};

