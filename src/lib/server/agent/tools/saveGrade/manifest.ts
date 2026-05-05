import {
	BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
} from '../constants';
import type { ToolManifest } from '../types';

export const saveGradeManifest: ToolManifest = {
	name: 'save_grade',
	displayName: 'Guardar calificación',
	description:
		'Guarda una calificación para el estudiante en la actividad actual u otra del curso. Úsala cuando hayas evaluado al estudiante y quieras registrar su nota. REQUIERE CONFIRMACIÓN del estudiante antes de ejecutarse.',
	category: 'evaluation',
	parametersSchema: {
		type: 'object',
		properties: {
			score: {
				type: 'number',
				description: 'Calificación entre 0.0 (0%) y 1.0 (100%)',
				minimum: 0,
				maximum: 1
			},
			feedback: {
				type: 'string',
				description: 'Retroalimentación textual para el estudiante'
			},
			activityId: {
				type: 'string',
				description: 'ID de la actividad a calificar. Si se omite, usa la actividad actual.'
			}
		},
		required: ['score']
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			score: { type: 'number' },
			scorePercent: { type: 'integer' },
			feedback: { type: 'string' }
		},
		required: ['activityId', 'score', 'scorePercent']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'saveGrade' },
	requiresConfirmation: true,
	riskLevel: 'medium',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};

