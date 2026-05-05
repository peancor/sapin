import { BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS } from '../constants';
import type { ToolManifest } from '../types';

export const analyzeActivityDifficultyManifest: ToolManifest = {
	name: 'analyze_activity_difficulty',
	displayName: 'Analizar dificultad de actividad',
	description:
		'Detecta senales de friccion, baja finalizacion, reintentos y focos de dificultad en una actividad.',
	category: 'evaluation',
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
			maxSignals: { type: 'integer', description: 'Numero maximo de senales de dificultad.' }
		},
		required: []
	},
	responseSchema: {
		type: 'object',
		properties: {
			activityId: { type: 'string' },
			activityName: { type: 'string' },
			summary: { type: 'object' },
			difficultySignals: { type: 'array' },
			frequentLearnerTerms: { type: 'array' },
			stuckSessions: { type: 'array' }
		},
		required: [
			'activityId',
			'activityName',
			'summary',
			'difficultySignals',
			'frequentLearnerTerms',
			'stuckSessions'
		]
	},
	executorType: 'builtin',
	executorConfig: { handler: 'analyzeActivityDifficulty' },
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_INSIGHTS
};
