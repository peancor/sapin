import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const forecastCompletionRiskManifest: ToolManifest = {
	name: 'forecast_completion_risk',
	displayName: 'Pronosticar riesgo de finalizacion',
	description:
		'Estima el riesgo de no completar la actividad a partir de progreso, engagement y senales de atasco.',
	category: 'evaluation',
	parametersSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string', description: 'Actividad a analizar.' },
			studentIds: {
				type: 'array',
				description: 'Lista opcional de estudiantes concretos.',
				items: { type: 'string' }
			},
			maxResults: { type: 'integer', description: 'Numero maximo de estudiantes a devolver.' },
			includeCompleted: {
				type: 'boolean',
				description: 'Si es true, incluye tambien estudiantes que ya completaron.'
			}
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			totalStudents: { type: 'integer' },
			students: { type: 'array' }
		},
		required: ['activityId', 'activityName', 'totalStudents', 'students']
	},
	executorType: 'builtin',
	executorConfig: { handler: 'forecastCompletionRisk' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
