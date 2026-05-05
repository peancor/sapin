import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const rubricEvaluateResponseManifest: ToolManifest = {
	name: 'rubric_evaluate_response',
	displayName: 'Evaluar respuesta con rubrica',
	description:
		'Valora de forma provisional una respuesta o transcript frente a una rubrica estructurada, con evidencia y limitaciones.',
	category: 'evaluation',
	parametersSchema: {
		type: 'object',
		properties: {
			activityId: {
				type: 'string',
				description: 'Actividad a la que pertenece la respuesta.'
			},
			studentId: {
				type: 'string',
				description: 'Estudiante a evaluar si se usa evidencia del transcript.'
			},
			chatId: {
				type: 'string',
				description: 'Sesion concreta a evaluar si se quiere restringir la evidencia.'
			},
			responseText: {
				type: 'string',
				description: 'Texto de respuesta provisto manualmente. Si se omite, usa la evidencia recuperada.'
			},
			rubric: {
				type: 'array',
				description: 'Criterios de la rubrica.',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						title: { type: 'string' },
						description: { type: 'string' },
						maxScore: { type: 'integer' },
						keywords: { type: 'array', items: { type: 'string' } }
					},
					required: ['title']
				}
			}
		},
		required: ['rubric']
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			student: { type: 'object' },
			chatId: { type: 'string' },
			evaluationMode: { type: 'string' },
			provisional: { type: 'boolean' },
			scale: { type: 'object' },
			criteria: { type: 'array' },
			limitations: { type: 'array' }
		},
		required: [
			'activityId',
			'activityName',
			'evaluationMode',
			'provisional',
			'scale',
			'criteria',
			'limitations'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'rubricEvaluateResponse' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
