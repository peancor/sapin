import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const compareStudentGroupsManifest: ToolManifest = {
	name: 'compare_student_groups',
	displayName: 'Comparar grupos de estudiantes',
	description:
		'Compara dos grupos de estudiantes dentro de la actividad en progreso, engagement y dificultad.',
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
				description: 'Grupo A por defecto si no se proporciona groupAStudentIds.',
				items: { type: 'string' }
			},
			groupAStudentIds: {
				type: 'array',
				description: 'Lista explicita de estudiantes del grupo A.',
				items: { type: 'string' }
			},
			groupBStudentIds: {
				type: 'array',
				description: 'Lista explicita de estudiantes del grupo B. Si se omite, usa el resto del curso.',
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
			labelA: { type: 'string', description: 'Etiqueta opcional para el grupo A.' },
			labelB: { type: 'string', description: 'Etiqueta opcional para el grupo B.' }
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			groupA: { type: 'object' },
			groupB: { type: 'object' },
			deltas: { type: 'object' }
		},
		required: ['activityId', 'activityName', 'groupA', 'groupB', 'deltas']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'compareStudentGroups' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
