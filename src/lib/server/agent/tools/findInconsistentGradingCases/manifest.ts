import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const findInconsistentGradingCasesManifest: ToolManifest = {
	name: 'find_inconsistent_grading_cases',
	displayName: 'Detectar inconsistencias de calificacion',
	description:
		'Busca casos donde la nota registrada no parece alinearse con la evidencia o difiere mucho entre perfiles similares.',
	category: 'evaluation',
	parametersSchema: {
		type: 'object',
		properties: {
			activityId: {
				type: 'string',
				description: 'Actividad a revisar.'
			},
			scoreGapThreshold: {
				type: 'integer',
				description: 'Diferencia minima de puntuacion para marcar un caso entre pares.'
			},
			maxResults: { type: 'integer', description: 'Numero maximo de casos a devolver.' }
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			totalReviewedStudents: { type: 'integer' },
			totalCases: { type: 'integer' },
			cases: { type: 'array' }
		},
		required: ['activityId', 'activityName', 'totalReviewedStudents', 'totalCases', 'cases']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'findInconsistentGradingCases' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
